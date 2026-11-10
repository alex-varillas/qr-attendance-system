import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { createResetLink, runMaintenance } from '../src/lib/maintenance.ts'
import { Client, OWNER, createTestApp, setupOwner } from './helpers.ts'
import type { TestContext } from './helpers.ts'

describe('maintenance and account recovery', () => {
  let ctx: TestContext
  let owner: Client

  before(async () => {
    ctx = await createTestApp()
    owner = await setupOwner(ctx)
  })
  after(async () => {
    await ctx.close()
  })

  it('removes expired sessions but keeps valid ones', async () => {
    const userId = (await ctx.pool.query('SELECT id FROM users')).rows[0].id
    await ctx.pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ('old-one', $1, now() - interval '1 hour')", [userId])
    const result = await runMaintenance(ctx.pool)
    assert.equal(result.sessions, 1)
    assert.equal((await owner.get('/api/auth/me')).status, 200)
  })

  it('removes old spent or expired links, but not recent ones', async () => {
    const email = 'someone@example.com'
    await ctx.pool.query(
      `INSERT INTO auth_tokens (kind, token_hash, email, expires_at, used_at) VALUES
         ('reset', 'a', $1, now() - interval '30 days', NULL),
         ('reset', 'b', $1, now() + interval '1 day', now() - interval '30 days'),
         ('reset', 'c', $1, now() + interval '1 day', NULL),
         ('reset', 'd', $1, now() - interval '1 hour', NULL)`,
      [email],
    )
    const result = await runMaintenance(ctx.pool)
    assert.equal(result.tokens, 2)
    const left = (await ctx.pool.query("SELECT token_hash FROM auth_tokens WHERE email = $1 ORDER BY token_hash", [email])).rows
    assert.deepEqual(left.map((row: { token_hash: string }) => row.token_hash), ['c', 'd'])
  })

  it('keeps recent PIN attempts, which the lockout depends on', async () => {
    const employee = (await owner.post('/api/employees', { name: 'Pin', last_name: 'Keeper', pin: '1234' })).body.id
    await ctx.pool.query(
      `INSERT INTO pin_attempts (employee_id, success, created_at) VALUES
         ($1, false, now() - interval '2 days'), ($1, false, now() - interval '1 minute')`,
      [employee],
    )
    const result = await runMaintenance(ctx.pool)
    assert.equal(result.pinAttempts, 1)
    assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM pin_attempts WHERE employee_id = $1', [employee])).rows[0].n, 1)
  })

  it('gives the owner a way back in without email', async () => {
    const link = await createResetLink(ctx.pool, OWNER.email.toUpperCase(), 'https://attendance.example.com/')
    assert.ok(link)
    assert.match(link, /^https:\/\/attendance\.example\.com\/reset-password\?token=[\w-]{20,}$/)
    const token = new URL(link).searchParams.get('token')
    assert.equal((await new Client(ctx.app).post('/api/auth/reset-password', { token, password: 'a brand new secret' })).status, 200)
    assert.equal((await new Client(ctx.app).post('/api/auth/login', { email: OWNER.email, password: 'a brand new secret' })).status, 200)
    assert.equal((await new Client(ctx.app).post('/api/auth/login', { email: OWNER.email, password: OWNER.password })).status, 401)
  })

  it('does not reveal or create links for an unknown email', async () => {
    assert.equal(await createResetLink(ctx.pool, 'nobody@example.com', 'https://x.example'), null)
    const count = (await ctx.pool.query("SELECT count(*)::int AS n FROM auth_tokens WHERE email = 'nobody@example.com'")).rows[0].n
    assert.equal(count, 0)
  })
})

describe('serving the web app', () => {
  let ctx: TestContext
  let webDir: string

  before(async () => {
    webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qras-web-'))
    fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>App</title><div id="root"></div>')
    fs.mkdirSync(path.join(webDir, 'assets'))
    fs.writeFileSync(path.join(webDir, 'assets', 'app.js'), 'console.log(1)')
    ctx = await createTestApp({ WEB_DIR: webDir })
  })
  after(async () => {
    await ctx.close()
    fs.rmSync(webDir, { recursive: true, force: true })
  })

  it('serves the app at the root and static assets', async () => {
    const root = await ctx.app.inject({ method: 'GET', url: '/' })
    assert.equal(root.statusCode, 200)
    assert.match(root.body, /<div id="root">/)
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/assets/app.js' })).statusCode, 200)
  })

  it('serves the app for client-side routes, so a reload or a QR link works', async () => {
    for (const url of ['/dashboard', '/checkin/11111111-1111-4111-8111-111111111111', '/accept-invite?token=abc']) {
      const response = await ctx.app.inject({ method: 'GET', url })
      assert.equal(response.statusCode, 200, url)
      assert.match(response.body, /<div id="root">/)
    }
  })

  it('still answers unknown API paths with JSON, never with the app', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/nothing' })
    assert.equal(response.statusCode, 404)
    assert.match(String(response.headers['content-type']), /json/)
  })

  it('does not serve files outside the web folder', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/../../etc/passwd' })
    assert.notEqual(response.statusCode, 500)
    assert.ok(!response.body.includes('root:'))
  })
})
