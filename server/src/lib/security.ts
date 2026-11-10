import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

export async function hashSecret(secret: string): Promise<string> {
  return hash(secret)
}

export async function verifySecret(storedHash: string, secret: string): Promise<boolean> {
  try {
    return await verify(storedHash, secret)
  } catch {
    return false
  }
}

/** A valid hash of a random value, used to spend the same time when the account does not exist. */
let dummyHash: Promise<string> | null = null
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashSecret(randomBytes(16).toString('hex'))
  return dummyHash
}

/** Random URL-safe token (the raw value is sent to the client, only its hash is stored). */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
