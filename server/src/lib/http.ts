import type { FastifyContextConfig, FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodType } from 'zod'

/** Route config with a per-IP rate limit (a no-op when limits are disabled, as in tests). */
export function rateLimit(app: FastifyInstance, max: number, timeWindow = '1 minute'): FastifyContextConfig {
  const config: FastifyContextConfig = {}
  if (app.config.rateLimit) config.rateLimit = { max, timeWindow }
  return config
}

/** Route config for endpoints that are reachable without signing in. Everything else requires a session. */
export function publicRoute(app: FastifyInstance, max?: number): FastifyContextConfig {
  const config: FastifyContextConfig = max ? rateLimit(app, max) : {}
  config.public = true
  return config
}

export function parseBody<T>(schema: ZodType<T>, request: FastifyRequest): T {
  return schema.parse(request.body ?? {})
}

export function parseQuery<T>(schema: ZodType<T>, request: FastifyRequest): T {
  return schema.parse(request.query ?? {})
}

export function parseParams<T>(schema: ZodType<T>, request: FastifyRequest): T {
  return schema.parse(request.params ?? {})
}

/** Public base URL for links that leave the server (invitations, password resets). */
export function baseUrl(request: FastifyRequest): string {
  return request.server.config.publicUrl ?? `${request.protocol}://${request.host}`
}
