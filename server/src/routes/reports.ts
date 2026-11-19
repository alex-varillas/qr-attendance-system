import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth, requireOwner } from '../auth.ts'
import { many, one } from '../db/index.ts'
import { badRequest, notFound } from '../lib/errors.ts'
import { reportsDir } from '../lib/files.ts'
import { parseParams, parseQuery } from '../lib/http.ts'
import { dateSchema, uuidSchema } from '../lib/validation.ts'

const idParams = z.object({ id: uuidSchema })
const rangeQuery = z.object({ from: dateSchema, to: dateSchema })
const MAX_RANGE_DAYS = 400

const FORMATS = {
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  pdf: { mime: 'application/pdf', magic: Buffer.from('%PDF-') },
} as const
type Format = keyof typeof FORMATS

/** A file name is only a label: path separators, control characters and leading dots are removed. */
const safeFileName = z
  .string()
  .max(200)
  // eslint-disable-next-line no-control-regex
  .transform((name) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim())
  .pipe(z.string().min(1))

const metaSchema = z.object({
  file_name: safeFileName,
  format: z.enum(['xlsx', 'pdf']),
  report_kind: z.string().trim().min(1).max(40).default('attendance'),
  date_from: dateSchema,
  date_to: dateSchema,
  employee_count: z.coerce.number().int().min(0).max(100000).optional(),
})

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

export default async function reportRoutes(app: FastifyInstance): Promise<void> {
  // Everything the browser needs to build the attendance report of a range of dates.
  app.get('/reports/data', async (request) => {
    requireAuth(request)
    const { from, to } = parseQuery(rangeQuery, request)
    const span = daysBetween(from, to)
    if (span < 0) throw badRequest('The end date cannot be before the start date', 'date_range')
    if (span > MAX_RANGE_DAYS) throw badRequest(`The range cannot exceed ${MAX_RANGE_DAYS} days`, 'range_too_long')

    const business = await one<{ id: string; name: string; tax_id: string | null; timezone: string }>(
      app.pool,
      'SELECT id, name, tax_id, timezone FROM business LIMIT 1',
    )
    if (!business) throw notFound('The system has not been set up yet')
    const tz = business.timezone

    const [employees, schedules, exceptions, locations, records, justifications, holidays, overtime] = await Promise.all([
      many(
        app.pool,
        // Each person is reported from the day they were added, or from their first mark if that was earlier.
        `SELECT e.id, e.name, e.last_name, e.doc_type, e.dni, e.puesto, e.location_id,
                to_char(
                  GREATEST($1::date, LEAST((e.created_at AT TIME ZONE $2)::date,
                    (SELECT min((ar.timestamp AT TIME ZONE $2)::date) FROM attendance_records ar WHERE ar.employee_id = e.id))),
                  'YYYY-MM-DD') AS report_from
           FROM employees e
          WHERE e.active = true AND e.role <> 'owner'
          ORDER BY e.last_name, e.name`,
        [from, tz],
      ),
      many(
        app.pool,
        `SELECT id, employee_id, location_id, name, days_of_week, start_time, end_time, break_start, break_end, is_default, active
           FROM schedules WHERE active = true`,
      ),
      many(
        app.pool,
        `SELECT id, employee_id, location_id, date, start_time, end_time, break_start, break_end, reason
           FROM schedule_exceptions WHERE date BETWEEN $1 AND $2`,
        [from, to],
      ),
      many(app.pool, 'SELECT id, name FROM locations WHERE active = true'),
      many(
        app.pool,
        `SELECT ar.employee_id, ar.type,
                to_char(ar.timestamp AT TIME ZONE $3, 'YYYY-MM-DD') AS date,
                to_char(ar.timestamp AT TIME ZONE $3, 'HH24:MI') AS time,
                ar.is_manual, ar.manual_reason, ar.location_id
           FROM attendance_records ar
          WHERE (ar.timestamp AT TIME ZONE $3)::date BETWEEN $1 AND $2
          ORDER BY ar.timestamp`,
        [from, to, tz],
      ),
      many(
        app.pool,
        `SELECT employee_id, date, date_to, type, reason, status
           FROM absence_justifications WHERE date BETWEEN $1 AND $2`,
        [from, to],
      ),
      many(app.pool, 'SELECT date, name FROM holidays WHERE date BETWEEN $1 AND $2 ORDER BY date', [from, to]),
      many(
        app.pool,
        `SELECT employee_id, date, minutes_authorized, consent, compensation, note
           FROM overtime_authorizations WHERE date BETWEEN $1 AND $2`,
        [from, to],
      ),
    ])

    return {
      business,
      employees,
      schedules,
      schedule_exceptions: exceptions,
      locations,
      records,
      justifications,
      holidays,
      overtime_authorizations: overtime,
    }
  })

  // ---- Saved report files -----------------------------------------------------

  app.get('/reports', async (request) => {
    requireAuth(request)
    return many(app.pool, 'SELECT * FROM reports ORDER BY created_at DESC LIMIT 500')
  })

  // The browser builds the Excel or PDF file and archives a copy here, so it can be downloaded again later.
  app.post('/reports', async (request, reply) => {
    const auth = requireAuth(request)
    if (!request.isMultipart()) throw badRequest('Send the report as multipart form data', 'not_multipart')

    const fields: Record<string, string> = {}
    let buffer: Buffer | null = null
    for await (const part of request.parts()) {
      if (part.type === 'file') buffer = await part.toBuffer()
      else if (typeof part.value === 'string') fields[part.fieldname] = part.value
    }
    if (!buffer) throw badRequest('No file received', 'no_file')
    const meta = metaSchema.parse(fields)
    const format: Format = meta.format
    // The file must really be what it claims to be, whatever its name says.
    if (!buffer.subarray(0, FORMATS[format].magic.length).equals(FORMATS[format].magic)) {
      throw badRequest(`The file is not a valid ${format.toUpperCase()}`, 'invalid_file')
    }

    const storagePath = `${randomUUID()}.${format}`
    fs.mkdirSync(reportsDir(app.config), { recursive: true })
    fs.writeFileSync(path.join(reportsDir(app.config), storagePath), buffer)
    const row = await one(
      app.pool,
      `INSERT INTO reports (file_name, storage_path, format, report_kind, date_from, date_to, employee_count, size_bytes, created_by, created_by_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [meta.file_name, storagePath, format, meta.report_kind, meta.date_from, meta.date_to, meta.employee_count ?? null, buffer.length, auth.userId, auth.email],
    )
    return reply.status(201).send(row)
  })

  app.get('/reports/:id/file', async (request, reply) => {
    requireAuth(request)
    const { id } = parseParams(idParams, request)
    const report = await one<{ file_name: string; storage_path: string; format: Format }>(
      app.pool,
      'SELECT file_name, storage_path, format FROM reports WHERE id = $1',
      [id],
    )
    if (!report) throw notFound('Report not found')
    const file = path.join(reportsDir(app.config), path.basename(report.storage_path))
    if (!fs.existsSync(file)) throw notFound('The file is no longer available')
    return reply
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(report.file_name)}`)
      .header('X-Content-Type-Options', 'nosniff')
      .type(FORMATS[report.format].mime)
      .send(fs.createReadStream(file))
  })

  app.delete('/reports/:id', async (request) => {
    requireOwner(request)
    const { id } = parseParams(idParams, request)
    const report = await one<{ storage_path: string }>(app.pool, 'DELETE FROM reports WHERE id = $1 RETURNING storage_path', [id])
    if (!report) throw notFound('Report not found')
    fs.rmSync(path.join(reportsDir(app.config), path.basename(report.storage_path)), { force: true })
    return { ok: true }
  })
}
