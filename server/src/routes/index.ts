import type { FastifyInstance } from 'fastify'
import authRoutes from './auth.ts'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { public: true } }, async () => ({ ok: true }))
  await app.register(authRoutes)
}
