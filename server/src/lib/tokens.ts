import { one } from '../db/index.ts'
import type { Queryable } from '../db/index.ts'
import { hashToken, newToken } from './security.ts'

export type TokenKind = 'invite' | 'reset'

export interface TokenRow {
  id: string
  kind: TokenKind
  email: string
  employee_id: string | null
  user_id: string | null
}

/** Creates a one-time token. Returns the raw value, which is shown only once; only its hash is stored. */
export async function issueToken(
  db: Queryable,
  input: { kind: TokenKind; email: string; employeeId?: string | null; userId?: string | null; hours: number },
): Promise<string> {
  const token = newToken()
  // A new link replaces any earlier unused one for the same purpose.
  if (input.employeeId) {
    await db.query('DELETE FROM auth_tokens WHERE kind = $1 AND employee_id = $2 AND used_at IS NULL', [
      input.kind,
      input.employeeId,
    ])
  }
  if (input.userId) {
    await db.query('DELETE FROM auth_tokens WHERE kind = $1 AND user_id = $2 AND used_at IS NULL', [
      input.kind,
      input.userId,
    ])
  }
  await db.query(
    `INSERT INTO auth_tokens (kind, token_hash, email, employee_id, user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6))`,
    [input.kind, hashToken(token), input.email, input.employeeId ?? null, input.userId ?? null, input.hours],
  )
  return token
}

/** Finds a token that is still valid (unused and not expired). Does not consume it. */
export async function findValidToken(db: Queryable, kind: TokenKind, token: string): Promise<TokenRow | null> {
  return one<TokenRow>(
    db,
    `SELECT id, kind, email, employee_id, user_id
       FROM auth_tokens
      WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(token), kind],
  )
}

export async function markTokenUsed(db: Queryable, id: string): Promise<void> {
  await db.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [id])
}
