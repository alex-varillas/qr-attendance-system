import type pg from 'pg'
import { one } from '../db/index.ts'
import type { Queryable } from '../db/index.ts'
import { issueToken } from './tokens.ts'

export interface MaintenanceResult {
  sessions: number
  tokens: number
  pinAttempts: number
}

/** Removes what is no longer needed: expired sessions, spent or expired links and old PIN attempts. */
export async function runMaintenance(db: Queryable): Promise<MaintenanceResult> {
  const sessions = await db.query('DELETE FROM sessions WHERE expires_at < now()')
  const tokens = await db.query(
    `DELETE FROM auth_tokens
      WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'`,
  )
  // The lockout only looks back five minutes, so a day of history is plenty.
  const pinAttempts = await db.query("DELETE FROM pin_attempts WHERE created_at < now() - interval '1 day'")
  return {
    sessions: sessions.rowCount ?? 0,
    tokens: tokens.rowCount ?? 0,
    pinAttempts: pinAttempts.rowCount ?? 0,
  }
}

/** Runs the maintenance now and then every hour. Returns a function that stops it. */
export function startMaintenance(
  pool: pg.Pool,
  log: { info: (obj: unknown, msg: string) => void; error: (obj: unknown, msg: string) => void },
  intervalMs = 60 * 60 * 1000,
): () => void {
  const run = () =>
    runMaintenance(pool).then(
      (result) => log.info(result, 'maintenance done'),
      (error) => log.error({ err: error }, 'maintenance failed'),
    )
  void run()
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

/**
 * A password reset link for an account, without needing email. Used by the command-line tool so the
 * owner can always get back in. Returns null when the email has no active account.
 */
export async function createResetLink(db: Queryable, email: string, baseUrl: string): Promise<string | null> {
  const user = await one<{ id: string; email: string }>(
    db,
    `SELECT u.id, u.email FROM users u JOIN employees e ON e.user_id = u.id
      WHERE u.email = $1 AND e.active = true`,
    [email.trim().toLowerCase()],
  )
  if (!user) return null
  const token = await issueToken(db, { kind: 'reset', email: user.email, userId: user.id, hours: 24 })
  return `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${token}`
}
