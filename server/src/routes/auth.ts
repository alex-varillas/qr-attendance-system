import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSession,
  requireAuth,
  setSessionCookie,
} from '../auth.ts'
import type { AuthContext } from '../auth.ts'
import { one, withTransaction } from '../db/index.ts'
import type { Queryable } from '../db/index.ts'
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.ts'
import { baseUrl, parseBody, parseParams, publicRoute } from '../lib/http.ts'
import { sendMail } from '../lib/mailer.ts'
import { getDummyHash, hashSecret, hashToken, normalizeEmail, verifySecret } from '../lib/security.ts'
import { findValidToken, issueToken, markTokenUsed } from '../lib/tokens.ts'
import { emailSchema, passwordSchema, timeZoneSchema } from '../lib/validation.ts'

const SETUP_LOCK = 7001

export async function buildMe(db: Queryable, auth: AuthContext) {
  const employee = await one(
    db,
    'SELECT id, name, last_name, email, role, permissions, photo_url FROM employees WHERE id = $1',
    [auth.employeeId],
  )
  const business = await one(db, 'SELECT * FROM business LIMIT 1')
  return { user: { id: auth.userId, email: auth.email }, employee, business }
}

const setupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  business_name: z.string().trim().min(1).max(150),
  tax_id: z.string().trim().max(50).nullable().optional(),
  timezone: timeZoneSchema.default('UTC'),
  locale: z.enum(['es', 'en']).default('en'),
})

const loginSchema = z.object({ email: z.string().trim().max(254), password: z.string().max(200) })
const tokenParams = z.object({ token: z.string().min(10).max(200) })
const acceptSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema })
const forgotSchema = z.object({ email: z.string().trim().max(254) })
const changePasswordSchema = z.object({ current_password: z.string().max(200), new_password: passwordSchema })

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // ---- First run -----------------------------------------------------------

  app.get('/setup/status', { config: publicRoute(app) }, async () => {
    const row = await one<{ name: string; locale: string }>(app.pool, 'SELECT name, locale FROM business LIMIT 1')
    return { needs_setup: !row, business_name: row?.name ?? null, locale: row?.locale ?? null }
  })

  // Creates the owner account and the business. It works exactly once: afterwards public registration
  // does not exist, and new administrators are invited by the owner.
  app.post('/setup', { config: publicRoute(app, 5) }, async (request, reply) => {
    const body = parseBody(setupSchema, request)
    const email = normalizeEmail(body.email)
    const passwordHash = await hashSecret(body.password)

    const created = await withTransaction(app.pool, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [SETUP_LOCK])
      if (await one(tx, 'SELECT id FROM business LIMIT 1')) {
        throw conflict('This installation is already set up', 'already_setup')
      }
      const user = await one<{ id: string }>(
        tx,
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [email, passwordHash],
      )
      const employee = await one<{ id: string }>(
        tx,
        `INSERT INTO employees (user_id, name, last_name, email, role)
         VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
        [user!.id, body.name, body.last_name, email],
      )
      await tx.query(
        'INSERT INTO business (name, tax_id, timezone, locale) VALUES ($1, $2, $3, $4)',
        [body.business_name, body.tax_id || null, body.timezone, body.locale],
      )
      return { userId: user!.id, employeeId: employee!.id }
    })

    const session = await createSession(app.pool, created.userId, app.config.sessionDays)
    setSessionCookie(request, reply, session.token, session.expiresAt)
    const auth: AuthContext = {
      userId: created.userId,
      email,
      employeeId: created.employeeId,
      role: 'owner',
      permissions: {},
      name: body.name,
      lastName: body.last_name,
    }
    return reply.status(201).send(await buildMe(app.pool, auth))
  })

  // ---- Session -------------------------------------------------------------

  app.post('/auth/login', { config: publicRoute(app, 10) }, async (request, reply) => {
    const body = parseBody(loginSchema, request)
    const email = normalizeEmail(body.email)
    const user = await one<{ id: string; password_hash: string }>(
      app.pool,
      `SELECT u.id, u.password_hash
         FROM users u JOIN employees e ON e.user_id = u.id
        WHERE u.email = $1 AND e.active = true AND e.role IN ('owner', 'admin')`,
      [email],
    )
    // Always verify something, so a missing account is indistinguishable from a wrong password.
    const valid = await verifySecret(user?.password_hash ?? (await getDummyHash()), body.password)
    if (!user || !valid) throw unauthorized('Incorrect email or password')

    await app.pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id])
    const session = await createSession(app.pool, user.id, app.config.sessionDays)
    setSessionCookie(request, reply, session.token, session.expiresAt)
    const employee = await one<{ id: string; role: 'owner' | 'admin'; permissions: Record<string, boolean>; name: string; last_name: string }>(
      app.pool,
      'SELECT id, role, permissions, name, last_name FROM employees WHERE user_id = $1',
      [user.id],
    )
    return buildMe(app.pool, {
      userId: user.id,
      email,
      employeeId: employee!.id,
      role: employee!.role,
      permissions: employee!.permissions,
      name: employee!.name,
      lastName: employee!.last_name,
    })
  })

  app.post('/auth/logout', { config: publicRoute(app) }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) await deleteSession(app.pool, token)
    clearSessionCookie(reply)
    return { ok: true }
  })

  app.get('/auth/me', async (request) => {
    const auth = requireAuth(request)
    return buildMe(app.pool, auth)
  })

  app.post('/auth/change-password', async (request) => {
    const auth = requireAuth(request)
    const body = parseBody(changePasswordSchema, request)
    const user = await one<{ password_hash: string }>(app.pool, 'SELECT password_hash FROM users WHERE id = $1', [
      auth.userId,
    ])
    if (!user || !(await verifySecret(user.password_hash, body.current_password))) {
      throw badRequest('The current password is incorrect', 'wrong_password')
    }
    const newHash = await hashSecret(body.new_password)
    const currentToken = request.cookies[SESSION_COOKIE]
    await withTransaction(app.pool, async (tx) => {
      await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, auth.userId])
      // Close every other session of this account.
      await tx.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [
        auth.userId,
        currentToken ? hashToken(currentToken) : '',
      ])
    })
    return { ok: true }
  })

  // ---- Invitations and password reset -------------------------------------

  // Describes a link so the page can greet the person before they choose a password.
  app.get('/auth/invitations/:token', { config: publicRoute(app, 30) }, async (request) => {
    const { token } = parseParams(tokenParams, request)
    const row = await findValidToken(app.pool, 'invite', token)
    if (!row) throw notFound('This invitation is not valid or has expired')
    const employee = row.employee_id
      ? await one<{ name: string; last_name: string }>(app.pool, 'SELECT name, last_name FROM employees WHERE id = $1', [
          row.employee_id,
        ])
      : null
    const business = await one<{ name: string }>(app.pool, 'SELECT name FROM business LIMIT 1')
    return { email: row.email, name: employee?.name ?? null, last_name: employee?.last_name ?? null, business_name: business?.name ?? null }
  })

  app.post('/auth/accept-invite', { config: publicRoute(app, 10) }, async (request, reply) => {
    const body = parseBody(acceptSchema, request)
    const passwordHash = await hashSecret(body.password)

    const userId = await withTransaction(app.pool, async (tx) => {
      const row = await findValidToken(tx, 'invite', body.token)
      if (!row || !row.employee_id) throw notFound('This invitation is not valid or has expired')
      const employee = await one<{ id: string; user_id: string | null; active: boolean }>(
        tx,
        'SELECT id, user_id, active FROM employees WHERE id = $1 FOR UPDATE',
        [row.employee_id],
      )
      if (!employee || !employee.active || employee.user_id) throw notFound('This invitation is not valid or has expired')
      const email = normalizeEmail(row.email)
      if (await one(tx, 'SELECT id FROM users WHERE email = $1', [email])) {
        throw conflict('An account with this email already exists', 'email_taken')
      }
      const user = await one<{ id: string }>(
        tx,
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [email, passwordHash],
      )
      await tx.query('UPDATE employees SET user_id = $1, email = COALESCE(email, $2) WHERE id = $3', [
        user!.id,
        email,
        employee.id,
      ])
      await markTokenUsed(tx, row.id)
      return user!.id
    })

    const session = await createSession(app.pool, userId, app.config.sessionDays)
    setSessionCookie(request, reply, session.token, session.expiresAt)
    const employee = await one<{ id: string; role: 'owner' | 'admin'; permissions: Record<string, boolean>; name: string; last_name: string; email: string }>(
      app.pool,
      'SELECT id, role, permissions, name, last_name, email FROM employees WHERE user_id = $1',
      [userId],
    )
    return buildMe(app.pool, {
      userId,
      email: employee!.email,
      employeeId: employee!.id,
      role: employee!.role,
      permissions: employee!.permissions,
      name: employee!.name,
      lastName: employee!.last_name,
    })
  })

  // Sends a reset link when SMTP is configured. It always answers the same way, so it cannot be used to
  // discover which emails have an account. Without SMTP, the owner generates the link from Settings.
  app.post('/auth/forgot-password', { config: publicRoute(app, 5) }, async (request) => {
    const body = parseBody(forgotSchema, request)
    const email = normalizeEmail(body.email)
    const emailConfigured = app.config.smtp !== null
    if (emailConfigured) {
      const user = await one<{ id: string }>(
        app.pool,
        `SELECT u.id FROM users u JOIN employees e ON e.user_id = u.id
          WHERE u.email = $1 AND e.active = true`,
        [email],
      )
      if (user) {
        const token = await issueToken(app.pool, { kind: 'reset', email, userId: user.id, hours: 2 })
        await sendMail(
          app.config,
          {
            to: email,
            subject: 'Reset your password',
            text: `Use this link to choose a new password (valid for 2 hours):\n\n${baseUrl(request)}/reset-password?token=${token}\n\nIf you did not ask for it, ignore this message.`,
          },
          request.log,
        )
      }
    }
    return { ok: true, email_configured: emailConfigured }
  })

  app.post('/auth/reset-password', { config: publicRoute(app, 10) }, async (request) => {
    const body = parseBody(acceptSchema, request)
    const passwordHash = await hashSecret(body.password)
    await withTransaction(app.pool, async (tx) => {
      const row = await findValidToken(tx, 'reset', body.token)
      if (!row || !row.user_id) throw notFound('This link is not valid or has expired')
      await tx.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, row.user_id])
      await tx.query('DELETE FROM sessions WHERE user_id = $1', [row.user_id])
      await markTokenUsed(tx, row.id)
    })
    return { ok: true }
  })
}
