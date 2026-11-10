import fs from 'node:fs'
import path from 'node:path'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimitPlugin from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { ZodError } from 'zod'
import { SESSION_COOKIE, loadSession } from './auth.ts'
import type { Config } from './config.ts'
import { HttpError, forbidden } from './lib/errors.ts'
import { EventHub } from './lib/events.ts'
import { registerRoutes } from './routes/index.ts'

export interface AppDeps {
  config: Config
  pool: pg.Pool
  fetch?: typeof fetch
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function buildApp({ config, pool, fetch: fetchFn }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  })

  app.decorate('pool', pool)
  app.decorate('config', config)
  app.decorate('events', new EventHub())
  app.decorate('fetchFn', fetchFn ?? fetch)
  app.decorate('routeTable', [])
  app.decorateRequest('auth', null)

  // Every route is registered with its access level so a test can prove that nothing is public by accident.
  app.addHook('onRoute', (route) => {
    if (route.method === 'HEAD') return
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    for (const method of methods) {
      app.routeTable.push({ method, url: route.url, public: route.config?.public === true })
    }
  })

  await app.register(cookie)
  await app.register(rateLimitPlugin, { global: false })
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } })

  // CSRF defence in depth (the session cookie is already SameSite=Lax): a browser request that changes
  // data must come from this same site.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return
    const origin = request.headers.origin
    if (!origin) return
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      throw forbidden('Cross-origin request blocked')
    }
    const allowedHosts = new Set<string>([request.host])
    for (const allowed of [...config.allowedOrigins, ...(config.publicUrl ? [config.publicUrl] : [])]) {
      try {
        allowedHosts.add(new URL(allowed).host)
      } catch {
        // Ignore malformed entries.
      }
    }
    if (!allowedHosts.has(originHost)) throw forbidden('Cross-origin request blocked')
  })

  // Identify the signed-in account (if any). Each route decides whether it requires one.
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE]
    request.auth = token ? await loadSession(pool, token) : null
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code })
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Invalid request',
        code: 'validation',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      })
    }
    const pgError = error as { code?: string }
    if (pgError.code === '23505') return reply.status(409).send({ error: 'This record already exists', code: 'duplicate' })
    if (pgError.code === '23503')
      return reply.status(409).send({ error: 'This record is still used by other records', code: 'in_use' })
    if (pgError.code === '23514') return reply.status(400).send({ error: 'Invalid value', code: 'constraint' })
    const status = (error as { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: (error as Error).message, code: 'bad_request' })
    }
    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({ error: 'Internal server error', code: 'internal' })
  })

  await app.register(registerRoutes, { prefix: '/api' })

  if (config.webDir && fs.existsSync(path.join(config.webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDir, wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html')
      return reply.status(404).send({ error: 'Not found', code: 'not_found' })
    })
  } else {
    app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: 'Not found', code: 'not_found' }))
  }

  return app
}
