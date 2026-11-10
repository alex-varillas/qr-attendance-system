import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getCheckinContext, listCheckinEmployees, registerCheckin } from '../lib/checkin.ts'
import { notFound } from '../lib/errors.ts'
import { parseBody, parseParams, publicRoute } from '../lib/http.ts'
import { uuidSchema } from '../lib/validation.ts'

const idParams = z.object({ id: uuidSchema })

const markSchema = z.object({
  employee_id: uuidSchema,
  location_id: uuidSchema.nullable().optional(),
  pin: z.string().max(20).nullable().optional(),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
  accuracy: z.number().finite().nullable().optional(),
  device_info: z.string().max(1000).nullable().optional(),
})

// The check-in screen is opened by employees from the QR code, without an account. It exposes only what
// that screen needs: the business name, the people who can check in, and a way to mark.
export default async function checkinRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/checkin/:id', { config: publicRoute(app, 120) }, async (request) => {
    const { id } = parseParams(idParams, request)
    const context = await getCheckinContext(app.pool, id)
    if (!context) throw notFound('This QR code is not valid')
    return context
  })

  app.get('/public/checkin/:id/employees', { config: publicRoute(app, 120) }, async (request) => {
    const { id } = parseParams(idParams, request)
    const context = await getCheckinContext(app.pool, id)
    if (!context) throw notFound('This QR code is not valid')
    return listCheckinEmployees(app.pool, context.location_id)
  })

  app.post('/public/checkin', { config: publicRoute(app, 60) }, async (request, reply) => {
    const body = parseBody(markSchema, request)
    const result = await registerCheckin(app.pool, {
      employeeId: body.employee_id,
      locationId: body.location_id ?? null,
      pin: body.pin ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      accuracy: body.accuracy ?? null,
      deviceInfo: body.device_info ?? null,
    })
    if (!result.ok) {
      return reply.status(result.status).send({ ok: false, error: result.error, code: result.code })
    }
    app.events.publish({
      type: 'attendance',
      data: {
        employee_id: result.body.employee.id,
        type: result.body.type,
        timestamp: result.body.timestamp,
        location_valid: result.body.location_valid,
      },
    })
    return reply.status(result.status).send(result.body)
  })
}
