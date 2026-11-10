import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../auth.ts'
import { badGateway } from '../lib/errors.ts'
import {
  NOMINATIM,
  nominatimReverseUrl,
  nominatimSearchUrl,
  parseNominatimReverse,
  parseNominatimSearch,
  parsePhotonReverse,
  parsePhotonSearch,
  photonReverseUrl,
  photonSearchUrl,
} from '../lib/geocoding.ts'
import { parseBody, rateLimit } from '../lib/http.ts'
import { one } from '../db/index.ts'

const geocodeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('search'), q: z.string().trim().max(200) }),
  z.object({ mode: z.literal('reverse'), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
])

const USER_AGENT = 'qr-attendance-system (self-hosted)'
const HEARTBEAT_MS = 25_000

export default async function liveRoutes(app: FastifyInstance): Promise<void> {
  // Server-Sent Events: the dashboard learns about a new mark the moment it happens.
  app.get('/events', async (request, reply) => {
    requireAuth(request)
    reply.hijack()
    const response = reply.raw
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.write(': connected\n\n')
    const unsubscribe = app.events.subscribe((event) => {
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
    })
    const heartbeat = setInterval(() => response.write(': ping\n\n'), HEARTBEAT_MS)
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  // Address search and reverse lookup for the map. Only signed-in accounts can use it, so the public
  // geocoding services are never exposed to strangers through this server.
  app.post('/geocode', { config: rateLimit(app, 30) }, async (request) => {
    requireAuth(request)
    const body = parseBody(geocodeSchema, request)
    const business = await one<{ locale: string }>(app.pool, 'SELECT locale FROM business LIMIT 1')
    const language = business?.locale ?? 'en'

    const call = async (url: string | URL, timeoutMs: number): Promise<unknown> => {
      const response = await app.fetchFn(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`status ${response.status}`)
      return response.json()
    }

    try {
      if (body.mode === 'search') {
        if (!body.q) return { results: [] }
        try {
          const results = parsePhotonSearch(await call(photonSearchUrl(body.q), 4000))
          if (results.length) return { results, provider: 'photon' }
        } catch {
          // Network error, HTTP error or timeout: try the fallback service.
        }
        return { results: parseNominatimSearch(await call(nominatimSearchUrl(body.q, language), 8000)), provider: 'nominatim' }
      }
      try {
        return { address: parsePhotonReverse(await call(photonReverseUrl(body.lat, body.lng), 4000)), provider: 'photon' }
      } catch {
        // An empty reverse answer is valid; only errors use the fallback.
      }
      return {
        address: parseNominatimReverse(await call(nominatimReverseUrl(body.lat, body.lng, language), 8000)),
        provider: 'nominatim',
      }
    } catch (error) {
      // Log the cause, never the search text or the coordinates.
      request.log.error({ err: error instanceof Error ? error.message : 'network error', service: NOMINATIM }, 'geocoding failed')
      throw badGateway('The address search is not available right now')
    }
  })
}
