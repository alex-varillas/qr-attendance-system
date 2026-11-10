import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Client, createTestApp, setupOwner } from './helpers.ts'
import type { TestContext } from './helpers.ts'

const SAMPLE_UUID = '11111111-1111-4111-8111-111111111111'

/** Replaces route parameters (":id", ":token") with plausible values. */
const fillParams = (url: string) => url.replace(/:token/g, 'x'.repeat(40)).replace(/:[a-zA-Z]+/g, SAMPLE_UUID)

describe('access control across the whole API', () => {
  let ctx: TestContext

  before(async () => {
    ctx = await createTestApp()
    await setupOwner(ctx)
  })
  after(async () => {
    await ctx.close()
  })

  it('every route that is not explicitly public refuses a request without a session', async () => {
    const guarded = ctx.app.routeTable.filter((route) => !route.public)
    assert.ok(guarded.length >= 20, `expected many guarded routes, found ${guarded.length}`)
    const anonymous = new Client(ctx.app)
    const failures: string[] = []
    for (const route of guarded) {
      const response = await anonymous.request(route.method, fillParams(route.url), ['GET', 'DELETE'].includes(route.method) ? undefined : {})
      if (response.status !== 401) failures.push(`${route.method} ${route.url} -> ${response.status}`)
    }
    assert.deepEqual(failures, [])
  })

  it('the public routes are exactly the expected ones', () => {
    const publicRoutes = ctx.app.routeTable
      .filter((route) => route.public)
      .map((route) => `${route.method} ${route.url}`)
      .sort()
    assert.deepEqual(publicRoutes, [
      'GET /api/auth/invitations/:token',
      'GET /api/health',
      'GET /api/public/checkin/:id',
      'GET /api/public/checkin/:id/employees',
      'GET /api/setup/status',
      'POST /api/auth/accept-invite',
      'POST /api/auth/forgot-password',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/reset-password',
      'POST /api/public/checkin',
      'POST /api/setup',
    ])
  })

  it('a session that has expired is refused', async () => {
    const owner = new Client(ctx.app)
    await owner.post('/api/auth/login', { email: 'owner@example.com', password: 'correct horse battery' })
    assert.equal((await owner.get('/api/employees')).status, 200)
    await ctx.pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'")
    assert.equal((await owner.get('/api/employees')).status, 401)
  })

  it('a made-up or tampered session cookie is refused', async () => {
    const forged = new Client(ctx.app)
    forged.cookie = 'qras_session=not-a-real-token'
    assert.equal((await forged.get('/api/employees')).status, 401)
  })

  it('does not reveal internals in an error', async () => {
    const owner = new Client(ctx.app)
    await owner.post('/api/auth/login', { email: 'owner@example.com', password: 'correct horse battery' })
    const response = await owner.request('POST', '/api/employees', { name: 'x'.repeat(5000), last_name: 'y' })
    assert.equal(response.status, 400)
    const text = JSON.stringify(response.body)
    assert.ok(!/stack|node_modules|\.ts:/i.test(text))
  })

  it('answers unknown API paths with a JSON 404', async () => {
    const response = await new Client(ctx.app).get('/api/nothing-here')
    assert.equal(response.status, 404)
    assert.equal(response.body.code, 'not_found')
  })
})
