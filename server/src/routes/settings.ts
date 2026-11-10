import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hasPermission, requireAuth, requireOwner, requirePermission } from '../auth.ts'
import { many, one } from '../db/index.ts'
import { forbidden, notFound } from '../lib/errors.ts'
import { parseBody, parseParams } from '../lib/http.ts'
import { buildInsert, buildUpdate } from '../lib/sql.ts'
import { dateSchema, optionalText, timeZoneSchema, uuidSchema } from '../lib/validation.ts'

const idParams = z.object({ id: uuidSchema })
const latitude = z.number().min(-90).max(90)
const longitude = z.number().min(-180).max(180)
const radius = z.number().int().min(1).max(100000)

const businessSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  tax_id: optionalText(50),
  timezone: timeZoneSchema.optional(),
  locale: z.enum(['es', 'en']).optional(),
  tolerance_minutes: z.number().int().min(0).max(240).optional(),
  geo_enabled: z.boolean().optional(),
  geo_radius_meters: radius.optional(),
  location_lat: latitude.nullable().optional(),
  location_lng: longitude.nullable().optional(),
  location_address: optionalText(300),
})

const locationFields = {
  name: z.string().trim().min(1).max(100),
  address: optionalText(300),
  lat: latitude.nullable().optional(),
  lng: longitude.nullable().optional(),
  geo_radius_meters: radius,
  geo_enabled: z.boolean(),
  active: z.boolean(),
}
const createLocationSchema = z.object({
  ...locationFields,
  geo_radius_meters: locationFields.geo_radius_meters.optional(),
  geo_enabled: locationFields.geo_enabled.optional(),
  active: locationFields.active.optional(),
})
const updateLocationSchema = z.object({
  name: locationFields.name.optional(),
  address: locationFields.address,
  lat: locationFields.lat,
  lng: locationFields.lng,
  geo_radius_meters: locationFields.geo_radius_meters.optional(),
  geo_enabled: locationFields.geo_enabled.optional(),
  active: locationFields.active.optional(),
})

const nameSchema = z.object({ name: z.string().trim().min(1).max(100) })
const holidaySchema = z.object({ date: dateSchema, name: z.string().trim().min(1).max(100) })

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // ---- The business ---------------------------------------------------------

  app.get('/business', async (request) => {
    requireAuth(request)
    return one(app.pool, 'SELECT * FROM business LIMIT 1')
  })

  // The owner edits everything. An administrator with the "manage settings" permission may only change
  // the late-arrival tolerance.
  app.patch('/business', async (request) => {
    const auth = requireAuth(request)
    const body = parseBody(businessSchema, request)
    if (auth.role !== 'owner') {
      if (!hasPermission(auth, 'manage_settings')) throw forbidden('Your account does not have this permission')
      const onlyTolerance = Object.keys(body).every((key) => key === 'tolerance_minutes')
      if (!onlyTolerance) throw forbidden('Only the owner can change these settings')
    }
    const business = await one<{ id: string }>(app.pool, 'SELECT id FROM business LIMIT 1')
    if (!business) throw notFound('The system has not been set up yet')
    const update = buildUpdate('business', { ...body, updated_at: new Date() }, 'id', business.id)
    const row = await one(app.pool, update!.text, update!.values)
    return row
  })

  // ---- Sites -----------------------------------------------------------------

  app.get('/locations', async (request) => {
    requireAuth(request)
    return many(app.pool, 'SELECT * FROM locations ORDER BY created_at')
  })

  app.post('/locations', async (request, reply) => {
    requireOwner(request)
    const body = parseBody(createLocationSchema, request)
    const insert = buildInsert('locations', body)
    return reply.status(201).send(await one(app.pool, insert.text, insert.values))
  })

  app.patch('/locations/:id', async (request) => {
    requireOwner(request)
    const { id } = parseParams(idParams, request)
    const body = parseBody(updateLocationSchema, request)
    const update = buildUpdate('locations', body, 'id', id)
    const row = update
      ? await one(app.pool, update.text, update.values)
      : await one(app.pool, 'SELECT * FROM locations WHERE id = $1', [id])
    if (!row) throw notFound('Location not found')
    return row
  })

  // ---- Departments -----------------------------------------------------------

  app.get('/departments', async (request) => {
    requireAuth(request)
    return many(app.pool, 'SELECT id, name FROM departments ORDER BY name')
  })

  app.post('/departments', async (request, reply) => {
    requirePermission(request, 'manage_settings')
    const { name } = parseBody(nameSchema, request)
    const row = await one(app.pool, 'INSERT INTO departments (name) VALUES ($1) RETURNING id, name', [name])
    return reply.status(201).send(row)
  })

  app.patch('/departments/:id', async (request) => {
    requirePermission(request, 'manage_settings')
    const { id } = parseParams(idParams, request)
    const { name } = parseBody(nameSchema, request)
    const row = await one(app.pool, 'UPDATE departments SET name = $1 WHERE id = $2 RETURNING id, name', [name, id])
    if (!row) throw notFound('Department not found')
    return row
  })

  // Employees of a deleted department simply end up without one.
  app.delete('/departments/:id', async (request) => {
    requirePermission(request, 'manage_settings')
    const { id } = parseParams(idParams, request)
    const result = await app.pool.query('DELETE FROM departments WHERE id = $1', [id])
    if (result.rowCount === 0) throw notFound('Department not found')
    return { ok: true }
  })

  // ---- Holidays --------------------------------------------------------------

  app.get('/holidays', async (request) => {
    requireAuth(request)
    return many(app.pool, 'SELECT id, date, name FROM holidays ORDER BY date')
  })

  app.post('/holidays', async (request, reply) => {
    requirePermission(request, 'manage_holidays')
    const body = parseBody(holidaySchema, request)
    const row = await one(app.pool, 'INSERT INTO holidays (date, name) VALUES ($1, $2) RETURNING id, date, name', [
      body.date,
      body.name,
    ])
    return reply.status(201).send(row)
  })

  app.delete('/holidays/:id', async (request) => {
    requirePermission(request, 'manage_holidays')
    const { id } = parseParams(idParams, request)
    const result = await app.pool.query('DELETE FROM holidays WHERE id = $1', [id])
    if (result.rowCount === 0) throw notFound('Holiday not found')
    return { ok: true }
  })
}
