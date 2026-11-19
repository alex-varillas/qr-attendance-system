import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apiCall, assert, clickText, expectNoText, expectText, login, wait } from './harness.mjs'
import { OWNER } from './auth.e2e.mjs'

export const title = 'Language'

// The language is a setting of the business: it applies to everyone. These scenarios run last, and the
// last one puts Spanish back, so nothing after them depends on the change.
const setLanguage = async (page, st, locale, saveLabel, savedLabel) => {
  await page.goto(`${st.baseUrl}/settings`)
  await page.waitForSelector('#settings-locale')
  await page.select('#settings-locale', locale)
  await clickText(page, saveLabel, 'button')
  await expectText(page, savedLabel)
}

export const scenarios = () => [
  ['the owner switches the interface to English and the screen follows without a reload', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await setLanguage(page, st, 'en', 'Guardar cambios', 'Changes saved')
    // The sidebar and the page changed language at once.
    await expectText(page, 'Employees')
    await expectText(page, 'Business details')
    assert((await page.evaluate(() => document.documentElement.lang)) === 'en', 'the page language should be English')
    assert((await st.sql('SELECT locale FROM business')).rows[0].locale === 'en', 'the language should be saved')
  }],

  ['the other screens are in English too, with dates and weekday names to match', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await expectText(page, 'Present')
    await expectNoText(page, 'Presentes')
    await page.goto(`${st.baseUrl}/employees`)
    await expectText(page, 'Add employee')
    await expectText(page, 'Import CSV')
    await page.goto(`${st.baseUrl}/reports`)
    await expectText(page, 'Attendance report')
  }],

  ['the check-in screen is in English and an unknown address says so', async (page, st) => {
    const business = (await st.sql('SELECT id FROM business')).rows[0].id
    await page.goto(`${st.baseUrl}/checkin/${business}`)
    await expectText(page, 'Select your name')
    await page.goto(`${st.baseUrl}/checkin/00000000-0000-4000-8000-000000000000`)
    await expectText(page, 'No registered employees')
  }],

  ['nothing is drawn in the wrong language while the language of the business is still on its way', async (page, st) => {
    // Hold the answer that carries the language back for a moment, like a slow connection would.
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (request.url().endsWith('/api/setup/status')) setTimeout(() => request.continue().catch(() => {}), 1500)
      else request.continue().catch(() => {})
    })
    await page.goto(`${st.baseUrl}/checkin/00000000-0000-4000-8000-000000000000`, { waitUntil: 'domcontentloaded' })
    await wait(600)
    const early = await page.evaluate(() => document.body?.innerText ?? '')
    assert(!/Sin empleados|Cargando|Pide al administrador/.test(early), `a Spanish text showed up before the language was known: ${JSON.stringify(early.slice(0, 120))}`)
    await expectText(page, 'No registered employees', 10000)
    await expectNoText(page, 'Sin empleados registrados')
  }],

  ['a message of the server arrives in the language of the screen', async (page, st) => {
    await page.goto(`${st.baseUrl}/login`)
    await page.waitForSelector('#email')
    await page.type('#email', 'nobody@example.com')
    await page.type('#password', 'not-the-password')
    await clickText(page, 'Sign in', 'button')
    await expectText(page, 'Incorrect email or password')
  }],

  ['the CSV import takes English column names and day names, and its template follows the language', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await page.goto(`${st.baseUrl}/employees`)
    await expectText(page, 'Add employee')
    const file = path.join(os.tmpdir(), `qras-import-en-${Date.now()}.csv`)
    fs.writeFileSync(file, 'first_name,last_name,document,job_title,rest_days\nNora,English,3001,Cashier,saturday/sunday\nNico,English,3002,Cashier,company\n')
    await clickText(page, 'Import CSV')
    // The columns shown to the person are the English ones.
    await expectText(page, 'first_name')
    const input = await page.waitForSelector('input[type="file"]')
    await input.uploadFile(file)
    await expectText(page, 'Import 2 employees')
    await clickText(page, 'Import 2 employees')
    await expectText(page, 'Import successful')
    await expectText(page, '2 employees created')
    fs.rmSync(file, { force: true })
    const rows = (await st.sql("SELECT e.name, s.days_of_week FROM employees e LEFT JOIN schedules s ON s.employee_id = e.id WHERE e.last_name = 'English' ORDER BY e.name")).rows
    assert(rows.length === 2, `both rows should exist: ${JSON.stringify(rows)}`)
    const nora = rows.find((row) => row.name === 'Nora')
    const nico = rows.find((row) => row.name === 'Nico')
    assert(JSON.stringify(nora?.days_of_week) === '[1,2,3,4,5]', `Nora rests on saturday and sunday: ${JSON.stringify(rows)}`)
    assert(nico?.days_of_week == null, `Nico uses the schedule of the business: ${JSON.stringify(rows)}`)
  }],

  ['the owner puts the interface back in Spanish', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await setLanguage(page, st, 'es', 'Save changes', 'Cambios guardados')
    await expectText(page, 'Empleados')
    assert((await st.sql('SELECT locale FROM business')).rows[0].locale === 'es', 'Spanish should be saved again')
    const me = await apiCall(page, 'GET', '/auth/me')
    assert(me.body.business.locale === 'es', 'the server should report Spanish')
  }],
]
