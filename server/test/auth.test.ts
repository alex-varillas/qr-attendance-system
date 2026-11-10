import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Client, OWNER, createTestApp, setupOwner } from './helpers.ts'
import type { TestContext } from './helpers.ts'

describe('first-run setup and sessions', () => {
  let ctx: TestContext
  before(async () => {
    ctx = await createTestApp()
  })
  after(async () => {
    await ctx.close()
  })

  it('reports that setup is needed on a fresh install', async () => {
    const response = await new Client(ctx.app).get('/api/setup/status')
    assert.equal(response.status, 200)
    assert.equal(response.body.needs_setup, true)
  })

  it('creates the owner and the business, and signs the owner in', async () => {
    const owner = await setupOwner(ctx)
    const me = await owner.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.user.email, OWNER.email)
    assert.equal(me.body.employee.role, 'owner')
    assert.equal(me.body.business.name, OWNER.business_name)
    assert.equal(me.body.business.timezone, 'America/Lima')
  })

  it('refuses a second setup, so public registration never opens', async () => {
    const response = await new Client(ctx.app).post('/api/setup', { ...OWNER, email: 'other@example.com' })
    assert.equal(response.status, 409)
    assert.equal(response.body.code, 'already_setup')
    const users = await ctx.pool.query('SELECT count(*)::int AS n FROM users')
    assert.equal(users.rows[0].n, 1)
  })

  it('stores a hash, never the password', async () => {
    const row = (await ctx.pool.query('SELECT password_hash FROM users')).rows[0]
    assert.ok(row.password_hash.startsWith('$argon2id$'))
    assert.ok(!row.password_hash.includes(OWNER.password))
  })

  it('rejects a wrong password and an unknown email with the same answer', async () => {
    const wrong = await new Client(ctx.app).post('/api/auth/login', { email: OWNER.email, password: 'nope nope nope' })
    const unknown = await new Client(ctx.app).post('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'nope nope nope',
    })
    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.deepEqual(wrong.body, unknown.body)
  })

  it('logs in with the right password and logs out', async () => {
    const client = new Client(ctx.app)
    const login = await client.post('/api/auth/login', { email: OWNER.email.toUpperCase(), password: OWNER.password })
    assert.equal(login.status, 200)
    assert.equal((await client.get('/api/auth/me')).status, 200)
    await client.post('/api/auth/logout')
    assert.equal((await client.get('/api/auth/me')).status, 401)
  })

  it('invalidates the session server side on logout', async () => {
    const client = new Client(ctx.app)
    await client.post('/api/auth/login', { email: OWNER.email, password: OWNER.password })
    const stolenCookie = client.cookie
    await client.post('/api/auth/logout')
    const replay = new Client(ctx.app)
    replay.cookie = stolenCookie
    assert.equal((await replay.get('/api/auth/me')).status, 401)
  })

  it('sets an httpOnly, SameSite=Lax session cookie', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: OWNER.email, password: OWNER.password },
    })
    const cookie = String(response.headers['set-cookie'])
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /SameSite=Lax/i)
  })

  it('blocks state-changing requests that come from another site', async () => {
    const response = await new Client(ctx.app).request(
      'POST',
      '/api/auth/login',
      { email: OWNER.email, password: OWNER.password },
      { origin: 'https://evil.example' },
    )
    assert.equal(response.status, 403)
  })

  it('validates the setup payload and leaves the install untouched', async () => {
    const fresh = await createTestApp()
    try {
      const response = await new Client(fresh.app).post('/api/setup', { ...OWNER, password: 'short' })
      assert.equal(response.status, 400)
      assert.equal(response.body.code, 'validation')
      assert.equal((await new Client(fresh.app).get('/api/setup/status')).body.needs_setup, true)
    } finally {
      await fresh.close()
    }
  })
})
