/**
 * Date helpers. Every date and time on screen is shown in the business time zone (set once the business
 * loads, see useAuth) and in the language chosen for the installation.
 *
 * Dates without a time ("YYYY-MM-DD", the shape of a DATE column) are formatted from their text and
 * never through `new Date('YYYY-MM-DD')`: that is read as UTC midnight and shifts the day in time zones
 * behind UTC.
 */

let TIMEZONE = 'UTC'
let LOCALE = 'es'

// "es" and "en" both write the day first and use a 24-hour clock here.
const LOCALE_TAGS = { es: 'es', en: 'en-GB' }
const tag = () => LOCALE_TAGS[LOCALE] ?? LOCALE

/** Sets the time zone used across the app (idempotent, ignores empty values). */
export function setAppTimezone(timezone) {
  if (timezone) TIMEZONE = timezone
}

export function getAppTimezone() {
  return TIMEZONE
}

/** Sets the language used for dates (idempotent, ignores empty values). */
export function setAppLocale(locale) {
  if (locale) LOCALE = locale
}

export function getAppLocale() {
  return LOCALE
}

/** Every IANA time zone the browser knows, with UTC first. */
export function listTimeZones() {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return ['UTC', ...supported.filter(zone => zone !== 'UTC')]
}

/** Today's date as YYYY-MM-DD in the business time zone. */
export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

/** Date (YYYY-MM-DD) of any timestamp, in the business time zone. */
export function dateOf(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

/** A timestamp as a day/month/year date, in the business time zone. */
export function formatDate(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleDateString(tag(), {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** A date without a time (YYYY-MM-DD) as day/month/year, with no time zone conversion. */
export function formatShortDate(date) {
  if (!date) return '-'
  const [year, month, day] = String(date).split('-').map(Number)
  // Noon, local time: immune to any shift by time zone.
  return new Date(year, month - 1, day, 12).toLocaleDateString(tag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** A timestamp as HH:MM, in the business time zone. */
export function formatTime(timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleTimeString(tag(), {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** The HH:MM of an ISO timestamp, in the business time zone. */
export function extractTime(timestamp) {
  if (!timestamp) return null
  const date = new Date(timestamp)
  const hour = date.toLocaleString('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hour12: false })
  const minute = date.toLocaleString('en-GB', { timeZone: TIMEZONE, minute: '2-digit' })
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

/** Name of the weekday of a date (YYYY-MM-DD or Date), in the app language. */
export function dayName(date, short = false) {
  const value = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 12)
    : new Date(date)
  const name = value.toLocaleDateString(tag(), { weekday: short ? 'short' : 'long' }).replace('.', '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Number of the weekday (0 = Sunday ... 6 = Saturday). */
export function dayNumber(date) {
  return new Date(date).getDay()
}

/** Monday to Sunday of the current week, as YYYY-MM-DD. */
export function currentWeek() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toLocaleDateString('en-CA', { timeZone: TIMEZONE }),
    end: sunday.toLocaleDateString('en-CA', { timeZone: TIMEZONE }),
  }
}

/** First day of the month of `date`, moved `offset` months: the "month navigator" pattern. */
export function firstDayOfMonth(date = new Date(), offset = 0) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

/** First and last day of the current month, as YYYY-MM-DD. */
export function currentMonth() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toLocaleDateString('en-CA', { timeZone: TIMEZONE }),
    end: end.toLocaleDateString('en-CA', { timeZone: TIMEZONE }),
  }
}

/**
 * Offset in minutes of an IANA time zone from UTC at a given instant (negative when behind UTC).
 * Takes daylight saving into account.
 */
function offsetMinutesAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(instant)
    .reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value
      return acc
    }, {})
  // Some engines report midnight as hour 24.
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour)
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second)
  return (asUTC - instant.getTime()) / 60000
}

/**
 * [start, end] in ISO UTC of a whole calendar day (YYYY-MM-DD) in the business time zone. Use it to
 * ask the server for the marks of "today" or of a given day.
 */
export function dayRangeISO(date) {
  const [year, month, day] = date.split('-').map(Number)
  const approx = new Date(`${date}T00:00:00Z`)
  const offset = offsetMinutesAt(approx, TIMEZONE)
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offset * 60000)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}
