import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import { Client, OWNER, createTestApp, setupOwner } from './helpers.ts'
import type { TestContext } from './helpers.ts'

const PHOTON_SEARCH = {
  features: [
    { geometry: { type: 'Point', coordinates: [-77.0428, -12.0464] }, properties: { name: 'Plaza Mayor', city: 'Lima', country: 'Peru' } },
    { geometry: { type: 'Point', coordinates: [999, 999] }, properties: { name: 'Nowhere' } },
  ],
}
const NOMINATIM_SEARCH = [{ lat: '40.4168', lon: '-3.7038', display_name: 'Madrid, Spain' }]

describe('live updates and address search', () => {
  let ctx: TestContext
  let owner: Client
  let calls: { url: string; userAgent: string | undefined }[]
  let behaviour: (url: string) => Response | Promise<Response>

  before(async () => {
    calls = []
    behaviour = () => new Response('{}', { status: 500 })
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, userAgent: (init?.headers as Record<string, string> | undefined)?.['User-Agent'] })
      return behaviour(url)
    }) as typeof fetch
    ctx = await createTestApp({}, { fetch: fakeFetch })
    owner = await setupOwner(ctx)
  })
  after(async () => {
    await ctx.close()
  })

  describe('events stream', () => {
    it('is refused without a session', async () => {
      assert.equal((await new Client(ctx.app).get('/api/events')).status, 401)
    })

    it('delivers a mark to a signed-in dashboard the moment it happens, and stops after it disconnects', async () => {
      await ctx.app.listen({ port: 0, host: '127.0.0.1' })
      const { port } = ctx.app.server.address() as AddressInfo
      const abort = new AbortController()
      const response = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: { cookie: owner.cookie }, signal: abort.signal })
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/)

      const employee = (await owner.post('/api/employees', { name: 'Live', last_name: 'Wire' })).body.id
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let received = ''
      const waitFor = async (needle: string) => {
        const deadline = Date.now() + 5000
        while (!received.includes(needle) && Date.now() < deadline) {
          const { value, done } = await reader.read()
          if (done) break
          received += decoder.decode(value)
        }
      }
      await waitFor(': connected')
      assert.equal(ctx.app.events.size, 1)
      await new Client(ctx.app).post('/api/public/checkin', { employee_id: employee })
      await waitFor('event: attendance')
      assert.match(received, /event: attendance\ndata: \{.*"type":"checkin".*\}/)
      assert.ok(received.includes(employee))

      abort.abort()
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(ctx.app.events.size, 0)
    })
  })

  describe('address search', () => {
    it('is only for signed-in accounts', async () => {
      assert.equal((await new Client(ctx.app).post('/api/geocode', { mode: 'search', q: 'lima' })).status, 401)
    })

    it('uses Photon first and returns clean results, dropping impossible coordinates', async () => {
      calls.length = 0
      behaviour = () => Response.json(PHOTON_SEARCH)
      const response = await owner.post('/api/geocode', { mode: 'search', q: 'Plaza Mayor' })
      assert.equal(response.status, 200)
      assert.equal(response.body.provider, 'photon')
      assert.deepEqual(response.body.results, [{ lat: -12.0464, lng: -77.0428, address: 'Plaza Mayor, Lima, Peru' }])
      assert.equal(calls.length, 1)
      assert.ok(calls[0]!.url.startsWith('https://photon.komoot.io/api/'))
      assert.ok(calls[0]!.userAgent)
    })

    it('falls back to Nominatim when Photon fails or finds nothing', async () => {
      calls.length = 0
      behaviour = (url) => (url.includes('photon') ? new Response('boom', { status: 503 }) : Response.json(NOMINATIM_SEARCH))
      const failed = await owner.post('/api/geocode', { mode: 'search', q: 'Madrid' })
      assert.equal(failed.body.provider, 'nominatim')
      assert.deepEqual(failed.body.results, [{ lat: 40.4168, lng: -3.7038, address: 'Madrid, Spain' }])

      behaviour = (url) => (url.includes('photon') ? Response.json({ features: [] }) : Response.json(NOMINATIM_SEARCH))
      const empty = await owner.post('/api/geocode', { mode: 'search', q: 'Madrid' })
      assert.equal(empty.body.provider, 'nominatim')
    })

    it('answers 502 when both services fail, without leaking details', async () => {
      behaviour = () => new Response('down', { status: 500 })
      const response = await owner.post('/api/geocode', { mode: 'search', q: 'Anywhere' })
      assert.equal(response.status, 502)
      assert.equal(response.body.code, 'bad_gateway')
      assert.ok(!JSON.stringify(response.body).includes('500'))
    })

    it('does not call any service for an empty search', async () => {
      calls.length = 0
      const response = await owner.post('/api/geocode', { mode: 'search', q: '   ' })
      assert.deepEqual(response.body, { results: [] })
      assert.equal(calls.length, 0)
    })

    it('finds the address of a point', async () => {
      behaviour = () => Response.json({ features: [{ properties: { street: 'Jr. Union', housenumber: '10', city: 'Lima', country: 'Peru' } }] })
      const response = await owner.post('/api/geocode', { mode: 'reverse', lat: -12.04, lng: -77.03 })
      assert.equal(response.body.address, 'Jr. Union 10, Lima, Peru')
    })

    it('rejects bad input', async () => {
      assert.equal((await owner.post('/api/geocode', { mode: 'reverse', lat: 200, lng: 0 })).status, 400)
      assert.equal((await owner.post('/api/geocode', { mode: 'nope' })).status, 400)
      assert.equal((await owner.post('/api/geocode', {})).status, 400)
      void OWNER
    })
  })
})
