import path from 'node:path'

export interface Config {
  databaseUrl: string
  port: number
  host: string
  /** Where uploaded files (employee photos, saved reports) are stored. */
  dataDir: string
  /** Public base URL used to build invitation links. Falls back to the request host. */
  publicUrl: string | null
  /** Force the Secure flag on the session cookie. "auto" follows the request protocol. */
  cookieSecure: boolean | 'auto'
  trustProxy: boolean
  /** Extra origins allowed to send state-changing requests (the Vite dev server, for example). */
  allowedOrigins: string[]
  /** Folder with the built frontend. When null the API runs alone (development). */
  webDir: string | null
  /** SMTP is optional: without it, links are shown on screen instead of emailed. */
  smtp: { url: string; from: string } | null
  sessionDays: number
  /** Disable the per-IP rate limits (tests only). */
  rateLimit: boolean
  logLevel: string
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const secure = env.COOKIE_SECURE
  const smtpUrl = env.SMTP_URL
  return {
    databaseUrl,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    publicUrl: env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/+$/, '') : null,
    cookieSecure: secure === undefined || secure === '' ? 'auto' : bool(secure, false),
    trustProxy: bool(env.TRUST_PROXY, false),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    webDir: env.WEB_DIR ? path.resolve(env.WEB_DIR) : null,
    smtp: smtpUrl ? { url: smtpUrl, from: env.SMTP_FROM ?? 'QR Attendance <no-reply@localhost>' } : null,
    sessionDays: Number(env.SESSION_DAYS ?? 14),
    rateLimit: bool(env.RATE_LIMIT, true),
    logLevel: env.LOG_LEVEL ?? 'info',
  }
}
