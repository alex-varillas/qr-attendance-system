import type { FastifyInstance } from 'fastify'
import authRoutes from './auth.ts'
import checkinRoutes from './checkin.ts'
import employeeRoutes from './employees.ts'
import scheduleRoutes from './schedules.ts'
import settingsRoutes from './settings.ts'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { public: true } }, async () => ({ ok: true }))
  await app.register(authRoutes)
  await app.register(employeeRoutes)
  await app.register(checkinRoutes)
  await app.register(settingsRoutes)
  await app.register(scheduleRoutes)
}
