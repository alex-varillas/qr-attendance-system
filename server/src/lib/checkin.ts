import type pg from 'pg'
import { many, one, withTransaction } from '../db/index.ts'
import type { Queryable } from '../db/index.ts'
import { verifySecret } from './security.ts'

// The rules for marking attendance live here, in one place.
export const PIN_MAX_FAILED_ATTEMPTS = 5
export const PIN_WINDOW_MINUTES = 5
/** The GPS accuracy reported by the device widens the allowed radius, but never by more than this. */
export const ACCURACY_CAP_METERS = 100
/** Earth radius used for distances (same value as the PostgreSQL earthdistance extension). */
const EARTH_RADIUS_METERS = 6378168

export type CheckinType = 'checkin' | 'break_start' | 'break_end' | 'checkout'

export interface CheckinInput {
  employeeId: string
  locationId?: string | null
  pin?: string | null
  lat?: number | null
  lng?: number | null
  accuracy?: number | null
  deviceInfo?: string | null
}

export type CheckinResult =
  | {
      ok: true
      status: 201
      body: {
        ok: true
        type: CheckinType
        type_label: string
        timestamp: string
        location_valid: boolean | null
        employee: { id: string; name: string; last_name: string }
      }
    }
  | { ok: false; status: number; error: string; code: string }

const fail = (status: number, code: string, error: string): CheckinResult => ({ ok: false, status, code, error })

const TYPE_LABELS: Record<CheckinType, string> = {
  checkin: 'Check-in recorded',
  break_start: 'Break started',
  break_end: 'Break ended',
  checkout: 'Check-out recorded',
}

/** Great-circle distance in meters between two coordinates. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}

interface Target {
  lat: number | null
  lng: number | null
  radius: number | null
  geoEnabled: boolean
}

/** Does the schedule that applies today (exception first, then employee, site and business schedules) include a break? */
async function hasBreakToday(
  db: Queryable,
  employeeId: string,
  locationId: string | null,
  today: string,
  dow: number,
): Promise<boolean> {
  const exceptionSql = `SELECT start_time, break_start, break_end FROM schedule_exceptions WHERE date = $1 AND `
  type Exception = { start_time: string | null; break_start: string | null; break_end: string | null }
  let exception = await one<Exception>(db, `${exceptionSql} employee_id = $2`, [today, employeeId])
  if (!exception && locationId) {
    exception = await one<Exception>(db, `${exceptionSql} employee_id IS NULL AND location_id = $2`, [today, locationId])
  }
  if (!exception) {
    exception = await one<Exception>(db, `${exceptionSql} employee_id IS NULL AND location_id IS NULL`, [today])
  }
  if (exception) {
    return exception.start_time === null ? true : exception.break_start !== null && exception.break_end !== null
  }

  // $1 is always the weekday; $2, when present, is the employee or the site.
  type Schedule = { break_start: string | null; break_end: string | null }
  const matching = (scope: string) =>
    `SELECT break_start, break_end FROM schedules WHERE active = true AND ${scope} AND $1 = ANY(days_of_week) LIMIT 1`
  const exists = (scope: string) => `SELECT 1 FROM schedules WHERE active = true AND ${scope} LIMIT 1`

  let schedule: Schedule | null
  if (await one(db, exists('employee_id = $1'), [employeeId])) {
    schedule = await one<Schedule>(db, matching('employee_id = $2'), [dow, employeeId])
  } else if (locationId && (await one(db, exists('employee_id IS NULL AND location_id = $1'), [locationId]))) {
    schedule = await one<Schedule>(db, matching('employee_id IS NULL AND location_id = $2'), [dow, locationId])
  } else {
    schedule = await one<Schedule>(db, matching('employee_id IS NULL AND location_id IS NULL AND is_default = true'), [dow])
  }
  // No schedule for today: assume a break, which allows the longest sequence of marks.
  return schedule ? schedule.break_start !== null && schedule.break_end !== null : true
}

/**
 * Records one attendance mark. Every business rule lives here: PIN (with lockout), site restriction,
 * mandatory location when the verification is on, and the type of the mark for the day.
 *
 * The whole operation runs in one transaction that is locked per employee, so two simultaneous taps can
 * neither exceed the day's marks nor register the same step twice. Failed attempts (wrong PIN, outside the
 * area) are recorded and committed; they are returned, not thrown, precisely so they are not rolled back.
 */
export async function registerCheckin(pool: pg.Pool, input: CheckinInput): Promise<CheckinResult> {
  return withTransaction(pool, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.employeeId])

    const employee = await one<{
      id: string
      name: string
      last_name: string
      location_id: string | null
      pin_enabled: boolean
      pin_hash: string | null
    }>(
      tx,
      'SELECT id, name, last_name, location_id, pin_enabled, pin_hash FROM employees WHERE id = $1 AND active = true',
      [input.employeeId],
    )
    if (!employee) return fail(404, 'employee_not_found', 'Employee not found')

    const locationId = input.locationId ?? null
    if (employee.location_id && employee.location_id !== locationId) {
      return fail(403, 'wrong_location', 'This employee cannot check in at this location')
    }

    // ---- PIN ----------------------------------------------------------------
    if (employee.pin_enabled) {
      if (!input.pin) return fail(400, 'pin_required', 'PIN required')

      const recent = await one<{ failed: number }>(
        tx,
        `SELECT count(*)::int AS failed FROM pin_attempts
          WHERE employee_id = $1 AND success = false
            AND created_at >= now() - make_interval(mins => $2)`,
        [employee.id, PIN_WINDOW_MINUTES],
      )
      if ((recent?.failed ?? 0) >= PIN_MAX_FAILED_ATTEMPTS) {
        // Locked: the PIN is not even checked, and the attempt extends the lockout.
        await tx.query('INSERT INTO pin_attempts (employee_id, success) VALUES ($1, false)', [employee.id])
        return fail(429, 'pin_locked', `Too many attempts. Try again in ${PIN_WINDOW_MINUTES} minutes.`)
      }

      const valid = employee.pin_hash ? await verifySecret(employee.pin_hash, input.pin) : false
      await tx.query('INSERT INTO pin_attempts (employee_id, success) VALUES ($1, $2)', [employee.id, valid])
      if (!valid) return fail(401, 'pin_invalid', 'Incorrect PIN')
    }

    // ---- Where the mark is allowed ------------------------------------------
    const business = await one<{
      timezone: string
      geo_enabled: boolean
      geo_radius_meters: number | null
      location_lat: number | null
      location_lng: number | null
    }>(tx, 'SELECT timezone, geo_enabled, geo_radius_meters, location_lat, location_lng FROM business LIMIT 1')
    if (!business) return fail(503, 'not_configured', 'The system has not been set up yet')

    let target: Target = {
      lat: business.location_lat,
      lng: business.location_lng,
      radius: business.geo_radius_meters,
      geoEnabled: business.geo_enabled,
    }
    if (locationId) {
      const location = await one<{ lat: number | null; lng: number | null; geo_radius_meters: number | null; geo_enabled: boolean }>(
        tx,
        'SELECT lat, lng, geo_radius_meters, geo_enabled FROM locations WHERE id = $1 AND active = true',
        [locationId],
      )
      if (!location) return fail(404, 'location_not_found', 'Location not found')
      target = { lat: location.lat, lng: location.lng, radius: location.geo_radius_meters, geoEnabled: location.geo_enabled }
    }

    // ---- Location. When the verification is on, a location is mandatory ------
    // Without valid coordinates nothing is recorded, and outside the allowed area neither. The client is
    // never trusted to send them: a direct call without coordinates is rejected like one that is too far.
    let locationValid: boolean | null = null
    const hasCoordinates = typeof input.lat === 'number' && typeof input.lng === 'number'
    const coordinatesInRange =
      hasCoordinates && Math.abs(input.lat as number) <= 90 && Math.abs(input.lng as number) <= 180

    if (target.geoEnabled) {
      if (!hasCoordinates) {
        return fail(400, 'geo_required', 'You must turn on and allow your location to check in.')
      }
      if (!coordinatesInRange) {
        return fail(400, 'geo_invalid', 'Your location could not be read correctly. Turn it on and try again.')
      }
      // Misconfigured place: fail closed, instead of letting everyone through.
      if (target.lat === null || target.lng === null || target.radius === null) {
        return fail(409, 'geo_misconfigured', 'The location of the workplace is not configured. Tell the administrator.')
      }

      const distance = distanceMeters(target.lat, target.lng, input.lat as number, input.lng as number)
      // The icon on the dashboard always uses the strict radius.
      locationValid = distance <= target.radius
      // The GPS accuracy gives some slack: never negative, and capped.
      const slack = Math.min(Math.max(input.accuracy ?? 0, 0), ACCURACY_CAP_METERS)
      if (distance > target.radius + slack) {
        await tx.query(
          `INSERT INTO geo_blocked_attempts (employee_id, location_id, attempted_lat, attempted_lng, distance_meters, accuracy_reported)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [employee.id, locationId, input.lat, input.lng, distance, input.accuracy ?? null],
        )
        return fail(
          403,
          'geo_out_of_range',
          'You are outside the allowed area. Move closer to the configured location and try again.',
        )
      }
    }

    // ---- Which mark is this? ------------------------------------------------
    const day = await one<{ today: string; dow: number }>(
      tx,
      `SELECT (now() AT TIME ZONE $1)::date AS today, EXTRACT(DOW FROM (now() AT TIME ZONE $1))::int AS dow`,
      [business.timezone],
    )
    const withBreak = await hasBreakToday(tx, employee.id, locationId, day!.today, day!.dow)
    const maxMarks = withBreak ? 4 : 2
    const done = await one<{ n: number }>(
      tx,
      `SELECT count(*)::int AS n FROM attendance_records
        WHERE employee_id = $1 AND (timestamp AT TIME ZONE $2)::date = $3::date`,
      [employee.id, business.timezone, day!.today],
    )
    const count = done?.n ?? 0
    if (count >= maxMarks) return fail(409, 'day_complete', 'You have already completed all of today\'s marks')

    const sequence: CheckinType[] = withBreak ? ['checkin', 'break_start', 'break_end', 'checkout'] : ['checkin', 'checkout']
    const type = sequence[count] as CheckinType

    const deviceInfo = input.deviceInfo ? input.deviceInfo.slice(0, 500) : null
    const record = await one<{ timestamp: Date }>(
      tx,
      `INSERT INTO attendance_records (employee_id, type, location_lat, location_lng, location_valid, device_info, location_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING timestamp`,
      [
        employee.id,
        type,
        coordinatesInRange ? input.lat : null,
        coordinatesInRange ? input.lng : null,
        locationValid,
        deviceInfo,
        locationId,
      ],
    )

    return {
      ok: true,
      status: 201,
      body: {
        ok: true,
        type,
        type_label: TYPE_LABELS[type],
        timestamp: (record!.timestamp as Date).toISOString(),
        location_valid: locationValid,
        employee: { id: employee.id, name: employee.name, last_name: employee.last_name },
      },
    }
  })
}

/** Employees shown on the public check-in screen. A site only lists people who may check in there. */
export async function listCheckinEmployees(db: Queryable, locationId: string | null) {
  return many(
    db,
    `SELECT id, name, last_name, pin_enabled
       FROM employees
      WHERE active = true AND role = 'employee'
        AND ($1::uuid IS NULL OR location_id IS NULL OR location_id = $1::uuid)
      ORDER BY name, last_name`,
    [locationId],
  )
}

export async function getCheckinContext(db: Queryable, id: string) {
  const location = await one<{
    id: string
    name: string
    geo_enabled: boolean
    geo_radius_meters: number
  }>(db, 'SELECT id, name, geo_enabled, geo_radius_meters FROM locations WHERE id = $1 AND active = true', [id])
  const business = await one<{ id: string; name: string; geo_enabled: boolean; geo_radius_meters: number }>(
    db,
    'SELECT id, name, geo_enabled, geo_radius_meters FROM business LIMIT 1',
  )
  if (!business) return null
  if (location) {
    return {
      type: 'location' as const,
      business_name: business.name,
      location_id: location.id,
      location_name: location.name,
      geo_enabled: location.geo_enabled,
      geo_radius_meters: location.geo_radius_meters,
    }
  }
  if (business.id === id) {
    return {
      type: 'business' as const,
      business_name: business.name,
      location_id: null,
      location_name: null,
      geo_enabled: business.geo_enabled,
      geo_radius_meters: business.geo_radius_meters,
    }
  }
  return null
}
