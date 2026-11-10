import nodemailer from 'nodemailer'
import type { Config } from '../config.ts'

export interface Mail {
  to: string
  subject: string
  text: string
}

/**
 * Sends an email when SMTP is configured. Returns false when it is not (or when sending fails),
 * so callers can fall back to showing the link on screen. Email is never required.
 */
export async function sendMail(
  config: Config,
  mail: Mail,
  log?: { error: (obj: unknown, msg: string) => void },
): Promise<boolean> {
  if (!config.smtp) return false
  try {
    const transport = nodemailer.createTransport(config.smtp.url)
    await transport.sendMail({ from: config.smtp.from, ...mail })
    return true
  } catch (error) {
    log?.error({ err: error }, 'Sending email failed')
    return false
  }
}
