import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { buildApp } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import type { Config } from '../src/config.ts'
import { createPool, runMigrations } from '../src/db/index.ts'

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://qras:qras@localhost:55433/postgres'

export interface TestContext {
  app: FastifyInstance
  pool: pg.Pool
  config: Config
  close: () => Promise<void>
}

/** A fresh, isolated database and app for one test file. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const dbName = `qras_test_${randomBytes(6).toString('hex')}`
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${dbName}`)
  await admin.end()

  const url = new URL(ADMIN_URL)
  url.pathname = `/${dbName}`
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qras-data-'))
  const config = loadConfig({
    DATABASE_URL: url.toString(),
    LOG_LEVEL: 'silent',
    RATE_LIMIT: 'false',
    DATA_DIR: dataDir,
    ...env,
  })
  const pool = createPool(config.databaseUrl)
  await runMigrations(pool)
  const app = await buildApp({ config, pool })
  await app.ready()

  return {
    app,
    pool,
    config,
    async close() {
      await app.close()
      await pool.end()
      const cleanup = new pg.Client({ connectionString: ADMIN_URL })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await cleanup.end()
      fs.rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export interface Reply<T = any> {
  status: number
  body: T
  headers: Record<string, unknown>
}

/** A tiny HTTP client with a cookie jar, so a test can act as one signed-in person. */
export class Client {
  app: FastifyInstance
  cookie = ''
  constructor(app: FastifyInstance) {
    this.app = app
  }

  async request<T = any>(
    method: string,
    url: string,
    payload?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Reply<T>> {
    const response = await this.app.inject({
      method: method as 'GET',
      url,
      payload: payload as object | undefined,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...extraHeaders },
    })
    const setCookie = response.headers['set-cookie']
    if (setCookie) {
      const first = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? ''
      const pair = first.split(';')[0] ?? ''
      // An empty value means the cookie was cleared.
      this.cookie = pair.endsWith('=') ? '' : pair
    }
    let body: any = response.body
    try {
      body = response.body ? JSON.parse(response.body) : null
    } catch {
      // Not JSON (for example a file download).
    }
    return { status: response.statusCode, body, headers: response.headers }
  }

  get = <T = any>(url: string) => this.request<T>('GET', url)
  post = <T = any>(url: string, payload?: unknown) => this.request<T>('POST', url, payload ?? {})
  put = <T = any>(url: string, payload?: unknown) => this.request<T>('PUT', url, payload ?? {})
  patch = <T = any>(url: string, payload?: unknown) => this.request<T>('PATCH', url, payload ?? {})
  delete = <T = any>(url: string) => this.request<T>('DELETE', url)
}

export const OWNER = {
  email: 'owner@example.com',
  password: 'correct horse battery',
  name: 'Olivia',
  last_name: 'Owner',
  business_name: 'Test Business',
  timezone: 'America/Lima',
  locale: 'en',
}

/** Runs the first-time setup and returns a client signed in as the owner. */
export async function setupOwner(ctx: TestContext): Promise<Client> {
  const client = new Client(ctx.app)
  const response = await client.post('/api/setup', OWNER)
  if (response.status !== 201) throw new Error(`setup failed: ${response.status} ${JSON.stringify(response.body)}`)
  return client
}
