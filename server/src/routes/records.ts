import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth, requireOwner, requirePermission } from '../auth.ts'
import { many, one } from '../db/index.ts'
import { badRequest, notFound } from '../lib/errors.ts'
import { parseBody, parseParams, parseQuery } from '../lib/http.ts'
import { buildInsert, buildUpdate } from '../lib/sql.ts'
import { dateSchema, optionalText, uuidSchema } from '../lib/validation.ts'

const idParams = z.object({ id: uuidSchema })
const isoDateTime = z.string().datetime({ offset: true })

const JUSTIFICATION_TYPES = [
  'permiso_con_goce',
  'permiso_sin_goce',
  'vacaciones',
  'descanso_medico',
  'licencia',
  'suspension',
  'comision_servicio',
  'otro',
] as const
const STATUSES = ['pending', 'approved', 'rejected'] as const

const attendanceQuery = z.object({ start: isoDateTime, end: isoDateTime, employee_id: uuidSchema.optional() })

const justificationQuery = z.object({
  date: dateSchema.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  employee_id: uuidSchema.optional(),
})

const justificationCreate = z.object({
  employee_id: uuidSchema,
  date: dateSchema,
  date_to: dateSchema.nullable().optional(),
  type: z.enum(JUSTIFICATION_TYPES).default('otro'),
  reason: z.string().trim().max(500).default(''),
  status: z.enum(STATUSES).optional(),
})
const justificationUpdate = z.object({
  type: z.enum(JUSTIFICATION_TYPES).optional(),
  reason: z.string().trim().max(500).optional(),
  date_to: dateSchema.nullable().optional(),
})

const adjustmentSchema = z.object({
  employee_id: uuidSchema,
  days: z.number().int().min(-365).max(365).refine((days) => days !== 0, 'The adjustment cannot be zero'),
  reason: optionalText(300),
})

const overtimeQuery = z.object({ date: dateSchema.optional(), from: dateSchema.optional(), to: dateSchema.optional() })
const overtimeSchema = z.object({
  employee_id: uuidSchema,
  date: dateSchema,
  minutes_authorized: z.number().int().min(0).max(24 * 60),
  consent: z.boolean().default(true),
  compensation: z.enum(['pago', 'descanso']).default('pago'),
  note: optionalText(500),
})

const JUSTIFICATION_COLUMNS = 'id, employee_id, date, date_to, type, reason, status, created_by, created_at, updated_at'

export default async function recordRoutes(app: FastifyInstance): Promise<void> {
  // ---- Attendance -------------------------------------------------------------

  // Marks between two instants. The client works out the day boundaries in the business timezone.
  app.get('/attendance', async (request) => {
    requireAuth(request)
    const query = parseQuery(attendanceQuery, request)
    return many(
      app.pool,
      `SELECT id, employee_id, type, timestamp, is_manual, location_id, location_valid
         FROM attendance_records
        WHERE timestamp >= $1 AND timestamp <= $2 AND ($3::uuid IS NULL OR employee_id = $3::uuid)
        ORDER BY timestamp
        LIMIT 50000`,
      [query.start, query.end, query.employee_id ?? null],
    )
  })

  // Attempts rejected for being outside the allowed area, this calendar month in the business timezone.
  app.get('/geo-blocked-attempts', async (request) => {
    requireAuth(request)
    return many(
      app.pool,
      `SELECT g.id, g.created_at, g.distance_meters, g.accuracy_reported,
              e.name AS employee_name, e.last_name AS employee_last_name, l.name AS location_name
         FROM geo_blocked_attempts g
         CROSS JOIN business b
         JOIN employees e ON e.id = g.employee_id
         LEFT JOIN locations l ON l.id = g.location_id
        WHERE g.created_at >= date_trunc('month', now() AT TIME ZONE b.timezone) AT TIME ZONE b.timezone
          AND g.created_at <  (date_trunc('month', now() AT TIME ZONE b.timezone) + interval '1 month') AT TIME ZONE b.timezone
        ORDER BY g.created_at DESC`,
    )
  })

  // ---- Absence justifications and leave ---------------------------------------

  app.get('/justifications', async (request) => {
    requireAuth(request)
    const query = parseQuery(justificationQuery, request)
    return many(
      app.pool,
      `SELECT ${JUSTIFICATION_COLUMNS} FROM absence_justifications
        WHERE ($1::date IS NULL OR (date <= $1::date AND COALESCE(date_to, date) >= $1::date))
          AND ($2::int IS NULL OR date BETWEEN make_date($2::int, 1, 1) AND make_date($2::int, 12, 31))
          AND ($3::uuid IS NULL OR employee_id = $3::uuid)
        ORDER BY date DESC
        LIMIT 5000`,
      [query.date ?? null, query.year ?? null, query.employee_id ?? null],
    )
  })

  app.post('/justifications', async (request, reply) => {
    const auth = requireAuth(request)
    const body = parseBody(justificationCreate, request)
    if (body.date_to && body.date_to < body.date) throw badRequest('The end date cannot be before the start date', 'date_range')
    if (!(await one(app.pool, 'SELECT 1 FROM employees WHERE id = $1', [body.employee_id]))) throw notFound('Employee not found')
    const insert = buildInsert('absence_justifications', { ...body, date_to: body.date_to || null, created_by: auth.userId })
    return reply.status(201).send(await one(app.pool, insert.text, insert.values))
  })

  app.patch('/justifications/:id', async (request) => {
    requireAuth(request)
    const { id } = parseParams(idParams, request)
    const body = parseBody(justificationUpdate, request)
    const update = buildUpdate(
      'absence_justifications',
      { ...body, ...(body.date_to !== undefined ? { date_to: body.date_to || null } : {}), updated_at: new Date() },
      'id',
      id,
    )
    const row = await one(app.pool, update!.text, update!.values)
    if (!row) throw notFound('Absence not found')
    return row
  })

  app.delete('/justifications/:id', async (request) => {
    requireAuth(request)
    const { id } = parseParams(idParams, request)
    const result = await app.pool.query('DELETE FROM absence_justifications WHERE id = $1', [id])
    if (result.rowCount === 0) throw notFound('Absence not found')
    return { ok: true }
  })

  // Approving or rejecting needs more than recording an absence: the owner or the settings permission.
  app.post('/justifications/:id/status', async (request) => {
    requirePermission(request, 'manage_settings')
    const { id } = parseParams(idParams, request)
    const { status } = parseBody(z.object({ status: z.enum(STATUSES) }), request)
    const row = await one(
      app.pool,
      `UPDATE absence_justifications SET status = $1, updated_at = now() WHERE id = $2 RETURNING ${JUSTIFICATION_COLUMNS}`,
      [status, id],
    )
    if (!row) throw notFound('Absence not found')
    return row
  })

  app.get('/vacation-adjustments', async (request) => {
    requireAuth(request)
    return many(app.pool, 'SELECT id, employee_id, days, reason, created_at FROM vacation_adjustments ORDER BY created_at DESC')
  })

  app.post('/vacation-adjustments', async (request, reply) => {
    const auth = requirePermission(request, 'manage_settings')
    const body = parseBody(adjustmentSchema, request)
    if (!(await one(app.pool, 'SELECT 1 FROM employees WHERE id = $1', [body.employee_id]))) throw notFound('Employee not found')
    const row = await one(
      app.pool,
      `INSERT INTO vacation_adjustments (employee_id, days, reason, created_by) VALUES ($1, $2, $3, $4)
       RETURNING id, employee_id, days, reason, created_at`,
      [body.employee_id, body.days, body.reason || '', auth.userId],
    )
    return reply.status(201).send(row)
  })

  // ---- Overtime authorizations -----------------------------------------------

  app.get('/overtime', async (request) => {
    requireAuth(request)
    const query = parseQuery(overtimeQuery, request)
    return many(
      app.pool,
      `SELECT id, employee_id, date, minutes_authorized, consent, compensation, note
         FROM overtime_authorizations
        WHERE ($1::date IS NULL OR date = $1::date)
          AND ($2::date IS NULL OR date >= $2::date)
          AND ($3::date IS NULL OR date <= $3::date)
        ORDER BY date DESC
        LIMIT 5000`,
      [query.date ?? null, query.from ?? null, query.to ?? null],
    )
  })

  // One authorization per employee and day: sending it again replaces it.
  app.put('/overtime', async (request) => {
    const auth = requireAuth(request)
    const body = parseBody(overtimeSchema, request)
    if (!(await one(app.pool, 'SELECT 1 FROM employees WHERE id = $1', [body.employee_id]))) throw notFound('Employee not found')
    return one(
      app.pool,
      `INSERT INTO overtime_authorizations (employee_id, date, minutes_authorized, authorized_by, consent, compensation, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (employee_id, date) DO UPDATE SET
         minutes_authorized = EXCLUDED.minutes_authorized, authorized_by = EXCLUDED.authorized_by,
         consent = EXCLUDED.consent, compensation = EXCLUDED.compensation, note = EXCLUDED.note
       RETURNING id, employee_id, date, minutes_authorized, consent, compensation, note`,
      [body.employee_id, body.date, body.minutes_authorized, auth.userId, body.consent, body.compensation, body.note || null],
    )
  })

  app.delete('/overtime/:id', async (request) => {
    requireOwner(request)
    const { id } = parseParams(idParams, request)
    const result = await app.pool.query('DELETE FROM overtime_authorizations WHERE id = $1', [id])
    if (result.rowCount === 0) throw notFound('Authorization not found')
    return { ok: true }
  })
}
