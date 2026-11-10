// End-to-end harness: a throwaway database, the real server serving the built web app, and a real
// Chrome driven by puppeteer. Nothing here touches any database other than a temporary one.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.resolve(here, '..')
const serverDir = path.resolve(webDir, '..', 'server')
const requireFromServer = createRequire(path.join(serverDir, 'package.json'))
const pg = requireFromServer('pg')

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://qras:qras@localhost:55433/postgres'
export const ARTIFACTS = path.join(here, 'artifacts')

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found) throw new Error('Chrome was not found. Set CHROME_PATH to its executable.')
  return found
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function waitFor(check, what, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${what}${lastError ? `: ${lastError.message}` : ''}`)
}

/** Starts a database, the server and Chrome. Call `stop()` when done. */
export async function startStack({ headless = true } = {}) {
  const dbName = `qras_e2e_${randomBytes(5).toString('hex')}`
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${dbName}`)
  await admin.end()
  const databaseUrl = new URL(ADMIN_URL)
  databaseUrl.pathname = `/${dbName}`

  const port = await freePort()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qras-e2e-data-'))
  const logs = []
  const server = spawn(process.execPath, ['src/index.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      WEB_DIR: path.join(webDir, 'dist'),
      LOG_LEVEL: 'warn',
      RATE_LIMIT: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => logs.push(String(chunk)))
  server.stderr.on('data', (chunk) => logs.push(String(chunk)))

  const baseUrl = `http://127.0.0.1:${port}`
  await waitFor(async () => (await fetch(`${baseUrl}/api/health`)).ok, 'the server to start')

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless,
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1280, height: 900 },
  })

  const dbPool = new pg.Pool({ connectionString: databaseUrl.toString() })

  return {
    baseUrl,
    browser,
    /** Direct access to the throwaway database, to check what the screens really saved. */
    sql: (text, params) => dbPool.query(text, params),
    serverLogs: () => logs.join(''),
    async newPage() {
      // Each scenario gets its own browser profile, so a session from one never leaks into the next.
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      page.browserContext = context
      const problems = []
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error' && !/favicon|Failed to load resource/.test(message.text())) problems.push(`console: ${message.text()}`)
      })
      page.problems = problems
      return page
    },
    async stop() {
      await browser.close().catch(() => {})
      await dbPool.end().catch(() => {})
      server.kill()
      await new Promise((resolve) => setTimeout(resolve, 300))
      const cleanup = new pg.Client({ connectionString: ADMIN_URL })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await cleanup.end()
      fs.rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** A tiny test runner: prints each scenario, saves a screenshot when one fails, and sets the exit code. */
export async function runScenarios(title, stack, scenarios) {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  let failed = 0
  console.log(`\n${title}`)
  for (const [name, scenario] of scenarios) {
    const page = await stack.newPage()
    try {
      await scenario(page, stack)
      if (page.problems.length) throw new Error(`The page reported errors:\n  ${page.problems.join('\n  ')}`)
      console.log(`  ✔ ${name}`)
    } catch (error) {
      failed++
      console.log(`  ✖ ${name}\n      ${String(error.message).replace(/\n/g, '\n      ')}`)
      const file = path.join(ARTIFACTS, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
      await page.screenshot({ path: file, fullPage: true }).catch(() => {})
      console.log(`      screenshot: ${file}`)
    } finally {
      await page.browserContext?.close().catch(() => {})
    }
  }
  console.log(`\n${scenarios.length - failed} passed, ${failed} failed`)
  return failed
}

// Small helpers shared by the scenarios ----------------------------------------------------------

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function expectText(page, text, timeout = 8000) {
  await page.waitForFunction(
    (needle) => document.body?.innerText.includes(needle),
    { timeout },
    text,
  ).catch(async () => {
    const body = await page.evaluate(() => document.body?.innerText.slice(0, 600))
    throw new Error(`Expected to see "${text}" but the page shows:\n${body}`)
  })
}

export async function expectNoText(page, text) {
  const present = await page.evaluate((needle) => document.body?.innerText.includes(needle), text)
  if (present) throw new Error(`Did not expect to see "${text}"`)
}

export async function clickText(page, text, selector = 'button, a') {
  const handle = await page.evaluateHandle(
    (needle, sel) => [...document.querySelectorAll(sel)].find((el) => el.innerText?.trim().includes(needle) && !el.disabled),
    text,
    selector,
  )
  const element = handle.asElement()
  if (!element) throw new Error(`No clickable element with the text "${text}"`)
  await element.click()
}

export async function fill(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 8000 })
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
}

/** Calls the API from inside the page, so the session cookie is used exactly like the app does. */
export function apiCall(page, method, path, body) {
  return page.evaluate(
    async (m, p, b) => {
      const response = await fetch(`/api${p}`, {
        method: m,
        headers: { 'content-type': 'application/json' },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      const text = await response.text()
      return { status: response.status, body: text ? JSON.parse(text) : null }
    },
    method,
    path,
    body,
  )
}

export function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export async function waitForPath(page, pathname, timeout = 8000) {
  await page.waitForFunction((expected) => location.pathname === expected, { timeout }, pathname).catch(() => {
    throw new Error(`Expected the page to be at ${pathname} but it is at ${new URL(page.url()).pathname}`)
  })
}
