import { apiCall, assert, clickText, expectText, fill, login, wait, waitForPath } from './harness.mjs'
import { OWNER } from './auth.e2e.mjs'

export const title = 'QR, check-in and sites'

const HOME = { latitude: -12.0464, longitude: -77.0428 }

async function asOwner(page, stack) {
  await login(page, stack.baseUrl, OWNER.email, OWNER.password)
}

async function businessId(stack) {
  return (await stack.sql('SELECT id FROM business')).rows[0].id
}

async function pick(page, name) {
  await expectText(page, 'Selecciona tu nombre') // the list has loaded
  await clickText(page, name, 'button')
  await clickText(page, `Registrar asistencia de ${name}`, 'button')
}

export const scenarios = () => [
  ['the owner sees the QR code of the business with its check-in address', async (page, st) => {
    await asOwner(page, st)
    await page.goto(`${st.baseUrl}/qr`)
    await expectText(page, OWNER.business)
    const id = await businessId(st)
    await expectText(page, `/checkin/${id}`)
    assert((await page.$('svg')) !== null, 'the QR code should be drawn')
  }],

  ['an employee scans the code and checks in without an account', async (page, st) => {
    const id = await businessId(st)
    await page.goto(`${st.baseUrl}/checkin/${id}`)
    await expectText(page, 'Corner Bakery')
    await pick(page, 'Ivan Import')
    await expectText(page, 'Entrada registrada')
    const row = (await st.sql("SELECT r.type FROM attendance_records r JOIN employees e ON e.id = r.employee_id WHERE e.name = 'Ivan'")).rows
    assert(row.length === 1 && row[0].type === 'checkin', 'the mark should be stored')
  }],

  ['the employee list never shows the owner or private data', async (page, st) => {
    const id = await businessId(st)
    await page.goto(`${st.baseUrl}/checkin/${id}`)
    await expectText(page, 'Olga Import')
    const text = await page.evaluate(() => document.body.innerText)
    assert(!text.includes('Olivia Owner'), 'the owner must not be listed')
    assert(!text.includes('@'), 'no email addresses on the public screen')
  }],

  ['a PIN is asked for, a wrong one is refused and the right one checks in', async (page, st) => {
    const owner = await st.newPage()
    try {
      await asOwner(owner, st)
      await apiCall(owner, 'POST', '/employees', { name: 'Pia', last_name: 'Pin', pin: '4321' })
    } finally {
      await owner.browserContext?.close().catch(() => {})
    }
    const id = await businessId(st)
    await page.goto(`${st.baseUrl}/checkin/${id}`)
    await pick(page, 'Pia Pin')
    await page.waitForSelector('input[inputmode="numeric"]')
    await page.type('input[inputmode="numeric"]', '0000')
    await clickText(page, 'Marcar asistencia', 'button')
    await expectText(page, 'PIN incorrecto')
    assert((await st.sql("SELECT count(*)::int AS n FROM attendance_records r JOIN employees e ON e.id = r.employee_id WHERE e.name = 'Pia'")).rows[0].n === 0, 'nothing should be stored')

    await page.goto(`${st.baseUrl}/checkin/${id}`)
    await pick(page, 'Pia Pin')
    await page.waitForSelector('input[inputmode="numeric"]')
    await page.type('input[inputmode="numeric"]', '4321')
    await clickText(page, 'Marcar asistencia', 'button')
    await expectText(page, 'Entrada registrada')
  }],

  ['with location verification on, outside the area is refused and inside works', async (page, st) => {
    const owner = await st.newPage()
    try {
      await asOwner(owner, st)
      const set = await apiCall(owner, 'PATCH', '/business', { geo_enabled: true, geo_radius_meters: 100, location_lat: HOME.latitude, location_lng: HOME.longitude })
      assert(set.status === 200, 'could not turn on the verification')
    } finally {
      await owner.browserContext?.close().catch(() => {})
    }
    const id = await businessId(st)
    await page.browserContext.overridePermissions(st.baseUrl, ['geolocation'])

    // 600 m north: refused, and the attempt is kept for the owner.
    await page.setGeolocation({ latitude: HOME.latitude + 0.0054, longitude: HOME.longitude, accuracy: 10 })
    await page.goto(`${st.baseUrl}/checkin/${id}`)
    await pick(page, 'Olga Import')
    await expectText(page, 'fuera del área permitida')
    assert((await st.sql("SELECT count(*)::int AS n FROM attendance_records r JOIN employees e ON e.id = r.employee_id WHERE e.name = 'Olga'")).rows[0].n === 0, 'a refused mark must not be stored')
    assert((await st.sql('SELECT count(*)::int AS n FROM geo_blocked_attempts')).rows[0].n === 1, 'the attempt should be logged')

    // 30 m away: accepted and marked valid.
    await page.setGeolocation({ latitude: HOME.latitude + 0.00027, longitude: HOME.longitude, accuracy: 10 })
    await page.goto(`${st.baseUrl}/checkin/${id}`)
    await pick(page, 'Olga Import')
    await expectText(page, 'Entrada registrada')
    const stored = (await st.sql("SELECT r.location_valid FROM attendance_records r JOIN employees e ON e.id = r.employee_id WHERE e.name = 'Olga'")).rows
    assert(stored.length === 1 && stored[0].location_valid === true, 'the mark should be stored as valid')
  }],

  ['with location verification on, denying the permission explains what to do', async (page, st) => {
    const id = await businessId(st)
    await page.browserContext.overridePermissions(st.baseUrl, [])
    await page.goto(`${st.baseUrl}/checkin/${id}`)
    await pick(page, 'Ivan Import')
    await expectText(page, 'permitir el acceso a tu ubicación')
  }],

  ['the owner turns the verification off again', async (page, st) => {
    await asOwner(page, st)
    const set = await apiCall(page, 'PATCH', '/business', { geo_enabled: false })
    assert(set.status === 200, 'could not turn the verification off')
  }],

  ['the owner creates a site and its own check-in address works', async (page, st) => {
    await asOwner(page, st)
    await page.goto(`${st.baseUrl}/locations`)
    await expectText(page, 'Nueva sede')
    await clickText(page, 'Nueva sede', 'button')
    await fill(page, 'input[placeholder="Ej: Sede Central"]', 'Downtown')
    await clickText(page, 'Crear sede', 'button')
    await expectText(page, 'Downtown')
    const site = (await st.sql("SELECT id FROM locations WHERE name = 'Downtown'")).rows[0]
    assert(site, 'the site should be saved')

    const anon = await st.newPage()
    try {
      await anon.goto(`${st.baseUrl}/checkin/${site.id}`)
      await expectText(anon, 'Downtown')
      await expectText(anon, 'Corner Bakery')
    } finally {
      await anon.browserContext?.close().catch(() => {})
    }
    void wait
    void waitForPath
  }],

  ['an address that is not a real QR code says so instead of breaking', async (page, st) => {
    await page.goto(`${st.baseUrl}/checkin/00000000-0000-4000-8000-000000000000`)
    await expectText(page, 'Sin empleados registrados')
  }],
]
