import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth.ts'
import { many, one, withTransaction } from '../db/index.ts'
import { badRequest, notFound } from '../lib/errors.ts'
import { parseBody, parseParams, parseQuery } from '../lib/http.ts'
import { dateSchema, optionalText, timeSchema, uuidSchema } from '../lib/validation.ts'

const idParams = z.object({ id: uuidSchema })
const nullableTime = timeSchema.nullable().optional()

const blockSchema = z.object({
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1, 'Each block needs at least one day').max(7),
  start_time: timeSchema,
  end_time: timeSchema,
  break_start: nullableTime,
  break_end: nullableTime,
})

const setSchedulesSchema = z.object({
  employee_id: uuidSchema.nullable().optional(),
  location_id: uuidSchema.nullable().optional(),
  blocks: z.array(blockSchema).min(1, 'Send at least one schedule block').max(7),
})

const scopeQuery = z.object({ employee_id: uuidSchema.optional(), location_id: uuidSchema.optional() })

const defaultScheduleSchema = z.object({
  start_time: timeSchema,
  end_time: timeSchema,
  break_start: nullableTime,
  break_end: nullableTime,
})

const exceptionSchema = z.object({
  date: dateSchema,
  employee_id: uuidSchema.nullable().optional(),
  location_id: uuidSchema.nullable().optional(),
  start_time: nullableTime,
  end_time: nullableTime,
  break_start: nullableTime,
  break_end: nullableTime,
  reason: optionalText(300),
})

const SCHEDULE_COLUMNS = 'id, employee_id, location_id, name, days_of_week, start_time, end_time, break_start, break_end, is_default, active'

export default async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/schedules', async (request) => {
    requireAuth(request)
    return many(app.pool, `SELECT ${SCHEDULE_COLUMNS} FROM schedules WHERE active = true ORDER BY is_default DESC, created_at`)
  })

  // Replaces the whole set of schedule blocks of one scope: the business (no ids), one site, or one employee.
  app.put('/schedules', async (request) => {
    requireAuth(request)
    const body = parseBody(setSchedulesSchema, request)
    const employeeId = body.employee_id ?? null
    const locationId = body.location_id ?? null
    if (employeeId && locationId) throw badRequest('A schedule belongs to one employee or one site, not both')

    // A day cannot appear in two blocks of the same scope.
    const seen = new Set<number>()
    for (const block of body.blocks) {
      for (const day of block.days_of_week) {
        if (seen.has(day)) throw badRequest('A day cannot be in more than one schedule block', 'schedule_overlap')
        seen.add(day)
      }
    }

    if (employeeId && !(await one(app.pool, 'SELECT 1 FROM employees WHERE id = $1', [employeeId]))) throw notFound('Employee not found')
    if (locationId && !(await one(app.pool, 'SELECT 1 FROM locations WHERE id = $1', [locationId]))) throw notFound('Location not found')

    const name = employeeId ? 'Personalized schedule' : locationId ? 'Site schedule' : 'Main schedule'
    await withTransaction(app.pool, async (tx) => {
      if (employeeId) await tx.query('DELETE FROM schedules WHERE employee_id = $1', [employeeId])
      else if (locationId) await tx.query('DELETE FROM schedules WHERE employee_id IS NULL AND location_id = $1', [locationId])
      else await tx.query('DELETE FROM schedules WHERE employee_id IS NULL AND location_id IS NULL')

      for (const block of body.blocks) {
        await tx.query(
          `INSERT INTO schedules (employee_id, location_id, name, days_of_week, start_time, end_time, break_start, break_end, is_default, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
          [
            employeeId,
            locationId,
            name,
            block.days_of_week,
            block.start_time,
            block.end_time,
            block.break_start || null,
            block.break_end || null,
            employeeId === null && locationId === null,
          ],
        )
      }
    })
    return many(app.pool, `SELECT ${SCHEDULE_COLUMNS} FROM schedules WHERE active = true ORDER BY is_default DESC, created_at`)
  })

  // Removes the own schedule of an employee or a site, so they fall back to the next level.
  app.delete('/schedules', async (request) => {
    requireAuth(request)
    const query = parseQuery(scopeQuery, request)
    if (query.employee_id && query.location_id) throw badRequest('Choose an employee or a site, not both')
    if (!query.employee_id && !query.location_id) {
      throw badRequest('Choose the employee or the site whose own schedule is removed', 'scope_required')
    }
    if (query.employee_id) await app.pool.query('DELETE FROM schedules WHERE employee_id = $1', [query.employee_id])
    else await app.pool.query('DELETE FROM schedules WHERE employee_id IS NULL AND location_id = $1', [query.location_id])
    return { ok: true }
  })

  // The first default schedule (monday to friday), used by the setup wizard. If one exists it is left alone.
  app.post('/schedules/default', async (request, reply) => {
    requirePermission(request, 'manage_settings')
    const body = parseBody(defaultScheduleSchema, request)
    const existing = await one(
      app.pool,
      `SELECT ${SCHEDULE_COLUMNS} FROM schedules WHERE employee_id IS NULL AND active = true LIMIT 1`,
    )
    if (existing) return existing
    const created = await one(
      app.pool,
      `INSERT INTO schedules (name, days_of_week, start_time, end_time, break_start, break_end, is_default, active)
       VALUES ('Main schedule', '{1,2,3,4,5}', $1, $2, $3, $4, true, true) RETURNING ${SCHEDULE_COLUMNS}`,
      [body.start_time, body.end_time, body.break_start || null, body.break_end || null],
    )
    return reply.status(201).send(created)
  })

  // ---- Date exceptions ------------------------------------------------------

  app.get('/schedule-exceptions', async (request) => {
    requireAuth(request)
    return many(
      app.pool,
      `SELECT id, employee_id, location_id, date, start_time, end_time, break_start, break_end, reason, created_at
         FROM schedule_exceptions ORDER BY date DESC`,
    )
  })

  // Creates or replaces the exception of one scope and date. No times means a non-working day.
  app.put('/schedule-exceptions', async (request) => {
    const auth = requireAuth(request)
    const body = parseBody(exceptionSchema, request)
    if (body.employee_id && body.location_id) throw badRequest('An exception belongs to one employee or one site, not both')
    if ((body.start_time == null) !== (body.end_time == null)) {
      throw badRequest('Set the start and end time together, or neither for a non-working day', 'times_pair')
    }
    return one(
      app.pool,
      `INSERT INTO schedule_exceptions (date, employee_id, location_id, start_time, end_time, break_start, break_end, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (date,
         COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid),
         COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
         break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end,
         reason = EXCLUDED.reason, created_by = EXCLUDED.created_by
       RETURNING id, employee_id, location_id, date, start_time, end_time, break_start, break_end, reason, created_at`,
      [
        body.date,
        body.employee_id ?? null,
        body.location_id ?? null,
        body.start_time ?? null,
        body.end_time ?? null,
        body.break_start ?? null,
        body.break_end ?? null,
        body.reason ?? null,
        auth.userId,
      ],
    )
  })

  app.delete('/schedule-exceptions/:id', async (request) => {
    requireAuth(request)
    const { id } = parseParams(idParams, request)
    const result = await app.pool.query('DELETE FROM schedule_exceptions WHERE id = $1', [id])
    if (result.rowCount === 0) throw notFound('Exception not found')
    return { ok: true }
  })
}
