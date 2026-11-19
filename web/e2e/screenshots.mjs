// Takes the screenshots used in the README and the docs, from the real app with made-up data.
//
//   npm --prefix web run screenshots      (needs the test database: npm run db:test, and Chrome or Edge)
//
// It starts the same throwaway stack as the end-to-end tests (a new database, a new server), fills it with an
// invented business, and writes the images to docs/images. Nothing here is real data.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiCall, clickText, expectText, startStack, wait } from './harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '..', '..', 'docs', 'images')
const OWNER = { email: 'maria@example.com', password: 'Demo-Password-2026!' }

// A small deterministic random generator, so the history looks the same every time.
function seeded(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** A fixed-offset zone where it is about 11:30 right now, so the dashboard shows a morning in progress. */
function morningZone() {
  const now = new Date()
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60
  let offset = Math.round(11.5 - utcHour)
  if (offset > 14) offset -= 24
  if (offset < -12) offset += 24
  if (offset === 0) return 'UTC'
  // Etc/GMT zones have the sign reversed: Etc/GMT-5 is UTC+5.
  return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`
}

const DEPARTMENTS = ['Sales', 'Operations', 'Customer care', 'Admin']
const PEOPLE = [
  ['Ana', 'Rivera', 'Barista', 'Operations', 'on-time'],
  ['Luis', 'Ortega', 'Cashier', 'Sales', 'on-time'],
  ['Marta', 'Kowalski', 'Baker', 'Operations', 'on-time'],
  ['Daniel', 'Okafor', 'Delivery driver', 'Operations', 'not-yet'],
  ['Sofia', 'Marini', 'Sales associate', 'Sales', 'on-time'],
  ['Jonas', 'Berg', 'Cook', 'Operations', 'on-time'],
  ['Priya', 'Nair', 'Accountant', 'Admin', 'on-time'],
  ['Carlos', 'Mendes', 'Waiter', 'Customer care', 'late'],
  ['Elena', 'Popescu', 'Waiter', 'Customer care', 'vacation'],
  ['Tomas', 'Silva', 'Warehouse clerk', 'Operations', 'late'],
  ['Hana', 'Sato', 'Cashier', 'Sales', 'on-time'],
  ['Omar', 'Haddad', 'Cleaner', 'Operations', 'not-yet'],
]
const TODAY_CHECKIN = { 'on-time': ['08:45', '08:50', '08:52', '08:55', '08:58', '09:01', '09:02'], late: ['09:22', '09:41'] }

const stack = await startStack({ headless: !process.env.HEADED })
fs.mkdirSync(OUT, { recursive: true })

async function shot(page, name, { mobile = false, wait: extra = 1400, ready } = {}) {
  if (ready) await ready()
  await wait(extra)
  const file = path.join(OUT, `${name}.webp`)
  await page.screenshot({ path: file, type: 'webp', quality: 88 })
  console.log(`  ${name}.webp  ${(fs.statSync(file).size / 1024).toFixed(0)} KB${mobile ? ' (mobile)' : ''}`)
}

try {
  const zone = morningZone()
  console.log(`Time zone for the demo: ${zone}`)

  // ---- First run ------------------------------------------------------------
  const page = await stack.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(`${stack.baseUrl}/setup`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#locale')
  await page.select('#locale', 'en')
  await expectText(page, 'Set up your business')
  await page.type('#business_name', 'Brightside Cafe')
  await shot(page, 'setup', { wait: 600 })

  const setup = await apiCall(page, 'POST', '/setup', {
    business_name: 'Brightside Cafe',
    timezone: zone,
    locale: 'en',
    name: 'Maria',
    last_name: 'Santos',
    email: OWNER.email,
    password: OWNER.password,
  })
  if (setup.status !== 201 && setup.status !== 200) throw new Error(`setup failed: ${JSON.stringify(setup.body)}`)
  // The second step of the setup: the usual working hours of the business.
  const hours = await apiCall(page, 'POST', '/schedules/default', { start_time: '09:00', end_time: '18:00', break_start: '13:00', break_end: '14:00' })
  if (hours.status >= 300) throw new Error(`schedule failed: ${JSON.stringify(hours.body)}`)

  // ---- The business ---------------------------------------------------------
  const departmentIds = {}
  for (const name of DEPARTMENTS) departmentIds[name] = (await apiCall(page, 'POST', '/departments', { name })).body.id
  await apiCall(page, 'POST', '/locations', { name: 'Main store', address: '12 Market Street', lat: 40.4168, lng: -3.7038, geo_radius_meters: 100, geo_enabled: false })
  await apiCall(page, 'POST', '/locations', { name: 'Warehouse', address: '4 Dock Road', lat: 40.4005, lng: -3.69, geo_radius_meters: 150, geo_enabled: false })
  await apiCall(page, 'PATCH', '/business', { tolerance_minutes: 5 })

  const people = []
  for (const [i, [name, last_name, puesto, department, mood]] of PEOPLE.entries()) {
    const created = await apiCall(page, 'POST', '/employees', {
      name, last_name, puesto, department_id: departmentIds[department], dni: String(30000000 + i * 1111),
      email: `${name.toLowerCase()}@example.com`, phone: `+1 555 01${String(10 + i).padStart(2, '0')}`,
      sex: i % 2 === 0 ? 'F' : 'M', birth_date: `199${i % 10}-0${1 + (i % 9)}-1${i % 9}`,
    })
    if (created.status !== 201) throw new Error(`employee failed: ${JSON.stringify(created.body)}`)
    people.push({ id: created.body.id, name, last_name, mood })
  }
  // Everyone has been there for a while, so the history below is not before their start.
  await stack.sql("UPDATE employees SET created_at = now() - interval '90 days'")

  // ---- Attendance: 25 weekdays of history and the morning in progress ---------
  const random = seeded(2026)
  const mark = (employeeId, type, daysAgo, hhmm) =>
    stack.sql(
      `INSERT INTO attendance_records (employee_id, type, timestamp)
       VALUES ($1, $2, (((now() AT TIME ZONE $3)::date - $4::int) + $5::time) AT TIME ZONE $3)`,
      [employeeId, type, zone, daysAgo, hhmm],
    )
  const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`
  const weekdayAgo = (daysAgo) => {
    const day = new Date(Date.now() - daysAgo * 86400000).getUTCDay()
    return day !== 0 && day !== 6
  }
  for (let daysAgo = 1; daysAgo <= 35; daysAgo++) {
    if (!weekdayAgo(daysAgo)) continue
    for (const person of people) {
      const roll = random()
      if (roll < 0.05) continue // absent that day
      const late = roll > 0.86 ? 6 + Math.floor(random() * 40) : 0
      const arrival = 9 * 60 + late - Math.floor(random() * 12)
      await mark(person.id, 'checkin', daysAgo, clock(arrival))
      await mark(person.id, 'break_start', daysAgo, clock(13 * 60 + Math.floor(random() * 8)))
      await mark(person.id, 'break_end', daysAgo, clock(14 * 60 + Math.floor(random() * 12)))
      await mark(person.id, 'checkout', daysAgo, clock(18 * 60 + Math.floor(random() * 25)))
    }
  }
  let onTime = 0
  let lateIndex = 0
  for (const person of people) {
    if (person.mood === 'on-time') await mark(person.id, 'checkin', 0, TODAY_CHECKIN['on-time'][onTime++ % TODAY_CHECKIN['on-time'].length])
    if (person.mood === 'late') await mark(person.id, 'checkin', 0, TODAY_CHECKIN.late[lateIndex++ % TODAY_CHECKIN.late.length])
  }

  // ---- Leave --------------------------------------------------------------------
  const todayIso = (await stack.sql('SELECT ((now() AT TIME ZONE $1)::date)::text AS d', [zone])).rows[0].d
  const shift = (days) => (stack.sql('SELECT ((($1::date) + $2::int))::text AS d', [todayIso, days]))
  const [inFour, inTwenty, inTwentySeven, fiveBack] = await Promise.all([4, 20, 27, -9].map((days) => shift(days)))
  const elena = people.find((person) => person.name === 'Elena').id
  const sofia = people.find((person) => person.name === 'Sofia').id
  const omar = people.find((person) => person.name === 'Omar').id
  const daniel = people.find((person) => person.name === 'Daniel').id
  await apiCall(page, 'POST', '/justifications', { employee_id: elena, date: todayIso, date_to: inFour.rows[0].d, type: 'vacaciones', reason: 'Family trip', status: 'approved' })
    await apiCall(page, 'POST', '/justifications', { employee_id: sofia, date: inTwenty.rows[0].d, date_to: inTwentySeven.rows[0].d, type: 'vacaciones', reason: 'Summer holiday', status: 'pending' })
  await apiCall(page, 'POST', '/justifications', { employee_id: omar, date: fiveBack.rows[0].d, type: 'descanso_medico', reason: 'Medical certificate delivered', status: 'approved' })
  await apiCall(page, 'POST', '/justifications', { employee_id: daniel, date: inFour.rows[0].d, type: 'permiso_sin_goce', reason: 'Personal errand', status: 'pending' })

  // ---- The screens ----------------------------------------------------------------
  await page.setViewport({ width: 1440, height: 900 })
  // The setup signed the owner in already: open the app as them.
  await page.goto(`${stack.baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await expectText(page, 'Present')
  await shot(page, 'dashboard')

  // A saved report, made the way a person would: from the dashboard.
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'qras-shots-'))
  const client = await page.createCDPSession()
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true, browserContextId: page.ownContext?.id })
  await clickText(page, 'Export', 'button')
  await expectText(page, 'Download Excel')
  await clickText(page, 'Download Excel', 'button')
  await wait(2500)
  fs.rmSync(downloads, { recursive: true, force: true })

  // Move around like a person would, through the sidebar: no full page reload, so the live connection of
  // the app is not opened again and again.
  const go = async (label) => {
    await clickText(page, label, 'a')
    await wait(400)
  }

  await go('Employees')
  await expectText(page, 'Ana Rivera')
  await shot(page, 'employees')

  await clickText(page, 'Carlos Mendes', 'a')
  await expectText(page, 'Carlos Mendes')
  await shot(page, 'employee-profile', { wait: 1800 })

  await go('Statistics')
  await expectText(page, 'Select an employee')
  await clickText(page, 'Select an employee', 'button')
  await clickText(page, 'Ana Rivera', 'button')
  await expectText(page, 'Punctuality')
  await shot(page, 'statistics', { wait: 2200 })

  await go('Vacation')
  await expectText(page, 'Vacation balance')
  await shot(page, 'leave')

  await go('QR code')
  await expectText(page, 'Print or display this QR')
  await shot(page, 'qr-code', { wait: 1800 })

  await go('Locations')
  await expectText(page, 'Main store')
  await shot(page, 'locations')

  await go('Reports')
  await expectText(page, 'Attendance report')
  await shot(page, 'reports')

  // ---- What an employee sees: the check-in screen on a phone ----------------------
  const phone = await stack.newPage()
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await phone.goto(`${stack.baseUrl}/checkin/${(await stack.sql('SELECT id FROM business')).rows[0].id}`, { waitUntil: 'domcontentloaded' })
  await expectText(phone, 'Ana Rivera')
  await shot(phone, 'checkin-mobile', { mobile: true, wait: 900 })
  await phone.ownContext?.close().catch(() => {})
} finally {
  await stack.stop()
}
console.log(`\nImages written to ${OUT}`)
