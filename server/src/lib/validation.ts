import { z } from 'zod'

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const timeZoneSchema = z.string().refine(isValidTimeZone, 'Invalid time zone')
export const uuidSchema = z.string().uuid()
export const passwordSchema = z.string().min(8, 'The password must have at least 8 characters').max(200)
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254)
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Expected a time as HH:MM')
export const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
