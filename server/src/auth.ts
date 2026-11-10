import type { FastifyReply, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { forbidden, unauthorized } from './lib/errors.ts'
import { hashToken, newToken } from './lib/security.ts'
import { one } from './db/index.ts'
import type { Queryable } from './db/index.ts'

export const SESSION_COOKIE = 'qras_session'

/** Permissions an owner can grant to an administrator. */
export const PERMISSIONS = ['manage_holidays', 'manage_settings'] as const
export type Permission = (typeof PERMISSIONS)[number]

/** Only the owner and the administrators have accounts, so an authenticated request is always one of them. */
export interface AuthContext {
  userId: string
  email: string
  employeeId: string
  role: 'owner' | 'admin'
  permissions: Record<string, boolean>
  name: string
  lastName: string
}

export async function loadSession(db: Queryable, token: string): Promise<AuthContext | null> {
  const row = await one<{
    user_id: string
    email: string
    employee_id: string
    role: 'owner' | 'admin'
    permissions: Record<string, boolean>
    name: string
    last_name: string
  }>(
    db,
    `SELECT u.id AS user_id, u.email, e.id AS employee_id, e.role, e.permissions, e.name, e.last_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN employees e ON e.user_id = u.id
      WHERE s.id = $1
        AND s.expires_at > now()
        AND e.active = true
        AND e.role IN ('owner', 'admin')`,
    [hashToken(token)],
  )
  if (!row) return null
  return {
    userId: row.user_id,
    email: row.email,
    employeeId: row.employee_id,
    role: row.role,
    permissions: row.permissions ?? {},
    name: row.name,
    lastName: row.last_name,
  }
}

export async function createSession(
  db: Queryable,
  userId: string,
  days: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  await db.query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token),
    userId,
    expiresAt,
  ])
  return { token, expiresAt }
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [hashToken(token)])
}

export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  const secure =
    request.server.config.cookieSecure === 'auto'
      ? request.protocol === 'https'
      : request.server.config.cookieSecure
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export function isOwner(auth: AuthContext): boolean {
  return auth.role === 'owner'
}

export function hasPermission(auth: AuthContext, permission: Permission): boolean {
  return auth.role === 'owner' || (auth.role === 'admin' && auth.permissions[permission] === true)
}

/** Any signed-in account (owner or administrator). */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized()
  return request.auth
}

export function requireOwner(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request)
  if (!isOwner(auth)) throw forbidden('Only the owner can do this')
  return auth
}

export function requirePermission(request: FastifyRequest, permission: Permission): AuthContext {
  const auth = requireAuth(request)
  if (!hasPermission(auth, permission)) throw forbidden('Your account does not have this permission')
  return auth
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
  interface FastifyInstance {
    pool: pg.Pool
    config: import('./config.ts').Config
    events: import('./lib/events.ts').EventHub
    routeTable: { method: string; url: string; public: boolean }[]
  }
  interface FastifyContextConfig {
    public?: boolean
  }
}
