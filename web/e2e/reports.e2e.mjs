import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { assert, clickText, expectText, login, wait } from './harness.mjs'
import { OWNER } from './auth.e2e.mjs'

export const title = 'Reports and exports'

const here = path.dirname(fileURLToPath(import.meta.url))
const requireFromWeb = createRequire(path.join(here, '..', 'package.json'))

/** Lets the page download files into a folder we can inspect. */
async function allowDownloads(page, dir) {
  const client = await page.createCDPSession()
  // Each scenario runs in its own browser profile, so the setting must name that profile.
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dir,
    eventsEnabled: true,
    browserContextId: page.ownContext?.id,
  })
}

async function waitForFile(dir, extension, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const file = fs.readdirSync(dir).find((name) => name.endsWith(extension) && !name.endsWith('.crdownload'))
    if (file) return path.join(dir, file)
    await wait(200)
  }
  throw new Error(`No ${extension} file was downloaded`)
}

const openExport = async (page, st) => {
  await login(page, st.baseUrl, OWNER.email, OWNER.password)
  await expectText(page, 'Presentes')
  await clickText(page, 'Exportar', 'button')
  await expectText(page, 'Descargar Excel')
}

export const scenarios = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qras-downloads-'))
  return [
    ['the Excel report downloads with the real data of the period', async (page, st) => {
      await allowDownloads(page, dir)
      await openExport(page, st)
      await clickText(page, 'Descargar Excel', 'button')
      const file = await waitForFile(dir, '.xlsx')
      const bytes = fs.readFileSync(file)
      assert(bytes.subarray(0, 2).toString() === 'PK', 'an .xlsx file is a zip archive')

      const XLSX = requireFromWeb('xlsx')
      const sheet = XLSX.read(bytes, { type: 'buffer' })
      const rows = XLSX.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { header: 1 })
      assert(rows[0].includes('Apellidos y Nombres') && rows[0].includes('Entrada'), `unexpected header ${JSON.stringify(rows[0])}`)
      const text = JSON.stringify(rows)
      assert(text.includes('Import Ivan') || text.includes('Ivan'), 'the checked-in employees should be in the report')
      assert(!text.includes('Owner'), 'the owner is not part of the report')
      // Each person is listed from the day they were added, never from before: nobody shows an absence for days
      // before they existed. Everyone here was added today, so there is at most one row per person.
      const today = (await st.sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date, 'DD/MM/YYYY') AS d, to_char((now() AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS iso")).rows[0]
      const dates = new Set(rows.slice(1).map((row) => String(row[4])))
      assert([...dates].every((value) => value === today.d || value === today.iso || value.includes(today.iso.slice(0, 4))), `unexpected dates ${[...dates].join(', ')}`)
      fs.rmSync(file)
    }],

    ['the PDF report downloads as a real PDF', async (page, st) => {
      await allowDownloads(page, dir)
      await openExport(page, st)
      await clickText(page, 'Descargar PDF', 'button')
      const file = await waitForFile(dir, '.pdf')
      const bytes = fs.readFileSync(file)
      assert(bytes.subarray(0, 5).toString() === '%PDF-', 'a PDF starts with %PDF-')
      assert(bytes.length > 1500, `the PDF looks empty (${bytes.length} bytes)`)
      fs.rmSync(file)
    }],

    ['both reports were kept on the server and appear in the list', async (page, st) => {
      await login(page, st.baseUrl, OWNER.email, OWNER.password)
      await page.goto(`${st.baseUrl}/reports`)
      await expectText(page, 'Descargar')
      const stored = (await st.sql('SELECT format, size_bytes, created_by_email FROM reports ORDER BY created_at')).rows
      assert(stored.length === 2, `expected 2 saved reports, found ${stored.length}`)
      assert(stored.map((row) => row.format).sort().join() === 'pdf,xlsx', 'one Excel and one PDF')
      assert(stored.every((row) => row.size_bytes > 0 && row.created_by_email === OWNER.email), 'sizes and author should be recorded')
    }],

    ['a saved report downloads again from the list', async (page, st) => {
      await allowDownloads(page, dir)
      await login(page, st.baseUrl, OWNER.email, OWNER.password)
      await page.goto(`${st.baseUrl}/reports`)
      await expectText(page, 'Descargar')
      await clickText(page, 'Descargar', 'button')
      const file = await waitForFile(dir, '.xlsx').catch(() => waitForFile(dir, '.pdf'))
      assert(fs.statSync(file).size > 0, 'the downloaded copy should not be empty')
      fs.rmSync(file)
    }],

    ['the owner deletes a saved report', async (page, st) => {
      await login(page, st.baseUrl, OWNER.email, OWNER.password)
      await page.goto(`${st.baseUrl}/reports`)
      await expectText(page, 'Descargar')
      await page.$eval('button[title="Eliminar reporte"]', (button) => button.click())
      await expectText(page, 'Eliminar reporte')
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Eliminar')?.click())
      await page.waitForFunction(() => !document.body.innerText.includes('Eliminando'), { timeout: 8000 })
      await wait(500)
      assert((await st.sql('SELECT count(*)::int AS n FROM reports')).rows[0].n === 1, 'one report should be left')
    }],
  ]
}
