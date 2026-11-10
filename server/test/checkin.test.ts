import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { ACCURACY_CAP_METERS, PIN_MAX_FAILED_ATTEMPTS, distanceMeters } from '../src/lib/checkin.ts'
import { Client, createTestApp, setupOwner } from './helpers.ts'
import type { TestContext } from './helpers.ts'

const HOME = { lat: -12.0464, lng: -77.0428 }
const METERS_PER_DEGREE = (6378168 * Math.PI) / 180

/** A point `meters` north of the workplace. */
const north = (meters: number) => ({ lat: HOME.lat + meters / METERS_PER_DEGREE, lng: HOME.lng })

describe('public check-in', () => {
  let ctx: TestContext
  let owner: Client
  let anon: Client
  let businessId: string

  const sql = (text: string, params: unknown[] = []) => ctx.pool.query(text, params)

  async function newEmployee(options: { pin?: string; locationId?: string } = {}): Promise<string> {
    const created = await owner.post('/api/employees', {
      name: 'Emp',
      last_name: `No${Math.random().toString(36).slice(2, 8)}`,
      ...(options.pin ? { pin: options.pin } : {}),
      ...(options.locationId ? { location_id: options.locationId } : {}),
    })
    assert.equal(created.status, 201)
    return created.body.id
  }

  const mark = (employeeId: string, extra: Record<string, unknown> = {}) =>
    anon.post('/api/public/checkin', { employee_id: employeeId, ...extra })

  const recordsOf = async (employeeId: string) =>
    (await sql('SELECT type, location_valid FROM attendance_records WHERE employee_id = $1 ORDER BY timestamp', [employeeId])).rows

  before(async () => {
    ctx = await createTestApp()
    owner = await setupOwner(ctx)
    anon = new Client(ctx.app)
    businessId = (await sql('SELECT id FROM business')).rows[0].id
  })
  after(async () => {
    await ctx.close()
  })

  beforeEach(async () => {
    // Every test starts with the location check off, no schedules and no exceptions.
    await sql('UPDATE business SET geo_enabled = false, geo_radius_meters = 100, location_lat = $1, location_lng = $2', [HOME.lat, HOME.lng])
    await sql('DELETE FROM schedules')
    await sql('DELETE FROM schedule_exceptions')
  })

  describe('the QR screen', () => {
    it('describes the business and lists only people who can check in', async () => {
      const id = await newEmployee()
      await owner.post('/api/employees', { name: 'Ina', last_name: 'Ctive', active: false })
      const context = await anon.get(`/api/public/checkin/${businessId}`)
      assert.equal(context.status, 200)
      assert.equal(context.body.type, 'business')
      assert.equal(context.body.business_name, 'Test Business')
      const employees = await anon.get(`/api/public/checkin/${businessId}/employees`)
      const ids = employees.body.map((employee: { id: string }) => employee.id)
      assert.ok(ids.includes(id))
      assert.ok(employees.body.every((employee: object) => !('pin_hash' in employee) && !('dni' in employee) && !('email' in employee)))
      // The owner and the inactive employee are not listed.
      assert.ok(employees.body.every((employee: { name: string }) => employee.name !== 'Ina' && employee.name !== 'Olivia'))
    })

    it('answers 404 for an unknown or malformed code', async () => {
      assert.equal((await anon.get('/api/public/checkin/00000000-0000-4000-8000-000000000000')).status, 404)
      assert.equal((await anon.get('/api/public/checkin/not-a-uuid')).status, 400)
    })

    it('describes a site and hides an inactive one', async () => {
      const site = (await sql("INSERT INTO locations (name, geo_enabled) VALUES ('Downtown', true) RETURNING id")).rows[0].id
      const context = await anon.get(`/api/public/checkin/${site}`)
      assert.equal(context.body.type, 'location')
      assert.equal(context.body.location_name, 'Downtown')
      assert.equal(context.body.geo_enabled, true)
      await sql('UPDATE locations SET active = false WHERE id = $1', [site])
      assert.equal((await anon.get(`/api/public/checkin/${site}`)).status, 404)
    })

    it('lists, for a site, people assigned to it or to no site', async () => {
      const a = (await sql("INSERT INTO locations (name) VALUES ('A') RETURNING id")).rows[0].id
      const b = (await sql("INSERT INTO locations (name) VALUES ('B') RETURNING id")).rows[0].id
      const atA = await newEmployee({ locationId: a })
      const atB = await newEmployee({ locationId: b })
      const anywhere = await newEmployee()
      const ids = (await anon.get(`/api/public/checkin/${a}/employees`)).body.map((employee: { id: string }) => employee.id)
      assert.ok(ids.includes(atA) && ids.includes(anywhere))
      assert.ok(!ids.includes(atB))
    })
  })

  describe('the sequence of marks in a day', () => {
    it('without a schedule allows four marks: entry, break start, break end, exit', async () => {
      const id = await newEmployee()
      const types: string[] = []
      for (let i = 0; i < 4; i++) {
        const response = await mark(id)
        assert.equal(response.status, 201)
        types.push(response.body.type)
      }
      assert.deepEqual(types, ['checkin', 'break_start', 'break_end', 'checkout'])
      const fifth = await mark(id)
      assert.equal(fifth.status, 409)
      assert.equal(fifth.body.code, 'day_complete')
      assert.equal((await recordsOf(id)).length, 4)
    })

    it('with a schedule without a break allows two marks', async () => {
      await sql("INSERT INTO schedules (is_default, start_time, end_time, days_of_week) VALUES (true, '09:00', '18:00', '{0,1,2,3,4,5,6}')")
      const id = await newEmployee()
      assert.equal((await mark(id)).body.type, 'checkin')
      assert.equal((await mark(id)).body.type, 'checkout')
      assert.equal((await mark(id)).body.code, 'day_complete')
    })

    it('with a schedule with a break allows four', async () => {
      await sql("INSERT INTO schedules (is_default, start_time, end_time, break_start, break_end, days_of_week) VALUES (true, '09:00', '18:00', '13:00', '14:00', '{0,1,2,3,4,5,6}')")
      const id = await newEmployee()
      for (let i = 0; i < 4; i++) assert.equal((await mark(id)).status, 201)
      assert.equal((await mark(id)).status, 409)
    })

    it('an employee schedule wins over the business one', async () => {
      await sql("INSERT INTO schedules (is_default, start_time, end_time, break_start, break_end, days_of_week) VALUES (true, '09:00', '18:00', '13:00', '14:00', '{0,1,2,3,4,5,6}')")
      const id = await newEmployee()
      await sql("INSERT INTO schedules (employee_id, start_time, end_time, days_of_week) VALUES ($1, '08:00', '14:00', '{0,1,2,3,4,5,6}')", [id])
      assert.equal((await mark(id)).body.type, 'checkin')
      assert.equal((await mark(id)).body.type, 'checkout')
      assert.equal((await mark(id)).status, 409)
    })

    it('a date exception overrides the schedule for that day', async () => {
      await sql("INSERT INTO schedules (is_default, start_time, end_time, break_start, break_end, days_of_week) VALUES (true, '09:00', '18:00', '13:00', '14:00', '{0,1,2,3,4,5,6}')")
      await sql("INSERT INTO schedule_exceptions (date, start_time, end_time) VALUES ((now() AT TIME ZONE 'America/Lima')::date, '09:00', '13:00')")
      const id = await newEmployee()
      assert.equal((await mark(id)).body.type, 'checkin')
      assert.equal((await mark(id)).body.type, 'checkout')
      assert.equal((await mark(id)).status, 409)
    })

    it('does not count yesterday in the business timezone', async () => {
      const id = await newEmployee()
      await sql(
        `INSERT INTO attendance_records (employee_id, type, timestamp)
         VALUES ($1, 'checkin', (((now() AT TIME ZONE 'America/Lima')::date)::timestamp AT TIME ZONE 'America/Lima') - interval '1 minute')`,
        [id],
      )
      assert.equal((await mark(id)).body.type, 'checkin')
    })

    it('two simultaneous taps never exceed the day or repeat a step', async () => {
      const id = await newEmployee()
      const results = await Promise.all(Array.from({ length: 7 }, () => mark(id)))
      const ok = results.filter((result) => result.status === 201)
      assert.equal(ok.length, 4)
      assert.deepEqual(ok.map((result) => result.body.type).sort(), ['break_end', 'break_start', 'checkin', 'checkout'])
      assert.equal(results.filter((result) => result.body.code === 'day_complete').length, 3)
      assert.equal((await recordsOf(id)).length, 4)
    })

    it('refuses unknown and inactive employees', async () => {
      assert.equal((await mark('00000000-0000-4000-8000-000000000000')).status, 404)
      const id = await newEmployee()
      await owner.patch(`/api/employees/${id}`, { active: false })
      assert.equal((await mark(id)).status, 404)
    })
  })

  describe('which site an employee may use', () => {
    it('an employee assigned to a site cannot check in at another site or with the general QR', async () => {
      const a = (await sql("INSERT INTO locations (name) VALUES ('A') RETURNING id")).rows[0].id
      const b = (await sql("INSERT INTO locations (name) VALUES ('B') RETURNING id")).rows[0].id
      const id = await newEmployee({ locationId: a })
      assert.equal((await mark(id, { location_id: b })).body.code, 'wrong_location')
      assert.equal((await mark(id)).body.code, 'wrong_location')
      assert.equal((await mark(id, { location_id: a })).status, 201)
    })

    it('refuses an unknown or inactive site instead of falling back silently', async () => {
      const id = await newEmployee()
      assert.equal((await mark(id, { location_id: '00000000-0000-4000-8000-000000000000' })).body.code, 'location_not_found')
      const site = (await sql("INSERT INTO locations (name, active) VALUES ('Closed', false) RETURNING id")).rows[0].id
      assert.equal((await mark(id, { location_id: site })).body.code, 'location_not_found')
    })
  })

  describe('PIN', () => {
    it('is required when the employee has one, and a correct PIN is accepted', async () => {
      const id = await newEmployee({ pin: '1234' })
      assert.equal((await mark(id)).body.code, 'pin_required')
      assert.equal((await mark(id, { pin: '' })).body.code, 'pin_required')
      assert.equal((await mark(id, { pin: '1234' })).status, 201)
      assert.equal((await recordsOf(id)).length, 1)
    })

    it('a wrong PIN records nothing', async () => {
      const id = await newEmployee({ pin: '1234' })
      const response = await mark(id, { pin: '0000' })
      assert.equal(response.status, 401)
      assert.equal(response.body.code, 'pin_invalid')
      assert.equal((await recordsOf(id)).length, 0)
    })

    it(`locks after ${PIN_MAX_FAILED_ATTEMPTS} failures, and the right PIN no longer helps`, async () => {
      const id = await newEmployee({ pin: '1234' })
      for (let i = 0; i < PIN_MAX_FAILED_ATTEMPTS; i++) assert.equal((await mark(id, { pin: '0000' })).body.code, 'pin_invalid')
      const locked = await mark(id, { pin: '1234' })
      assert.equal(locked.status, 429)
      assert.equal(locked.body.code, 'pin_locked')
      assert.equal((await recordsOf(id)).length, 0)
    })

    it('does not even check the PIN while locked (the attempt is recorded as a failure)', async () => {
      const id = await newEmployee({ pin: '1234' })
      for (let i = 0; i < PIN_MAX_FAILED_ATTEMPTS; i++) await mark(id, { pin: '0000' })
      await mark(id, { pin: '1234' })
      const attempts = (await sql('SELECT success FROM pin_attempts WHERE employee_id = $1 ORDER BY created_at', [id])).rows
      assert.equal(attempts.length, PIN_MAX_FAILED_ATTEMPTS + 1)
      assert.ok(attempts.every((attempt: { success: boolean }) => attempt.success === false))
    })

    it('unlocks once the failures are older than five minutes', async () => {
      const id = await newEmployee({ pin: '1234' })
      for (let i = 0; i < PIN_MAX_FAILED_ATTEMPTS; i++) await mark(id, { pin: '0000' })
      assert.equal((await mark(id, { pin: '1234' })).body.code, 'pin_locked')
      await sql("UPDATE pin_attempts SET created_at = now() - interval '6 minutes' WHERE employee_id = $1", [id])
      assert.equal((await mark(id, { pin: '1234' })).status, 201)
    })

    it('failures before the limit do not lock', async () => {
      const id = await newEmployee({ pin: '1234' })
      for (let i = 0; i < PIN_MAX_FAILED_ATTEMPTS - 1; i++) await mark(id, { pin: '0000' })
      assert.equal((await mark(id, { pin: '1234' })).status, 201)
    })

    it('locks each employee separately', async () => {
      const a = await newEmployee({ pin: '1234' })
      const b = await newEmployee({ pin: '1234' })
      for (let i = 0; i < PIN_MAX_FAILED_ATTEMPTS; i++) await mark(a, { pin: '0000' })
      assert.equal((await mark(b, { pin: '1234' })).status, 201)
    })

    it('an employee without a PIN needs none', async () => {
      assert.equal((await mark(await newEmployee())).status, 201)
    })
  })

  describe('location verification', () => {
    const geoOn = (radius = 100) => sql('UPDATE business SET geo_enabled = true, geo_radius_meters = $1', [radius])

    it('turned off: location is not required and is not judged', async () => {
      const id = await newEmployee()
      const response = await mark(id)
      assert.equal(response.status, 201)
      assert.equal(response.body.location_valid, null)
      // Even far away.
      const far = await mark(id, { lat: 40, lng: 10 })
      assert.equal(far.status, 201)
    })

    it('turned on: a check-in without coordinates is rejected and nothing is recorded', async () => {
      await geoOn()
      const id = await newEmployee()
      for (const body of [{}, { lat: HOME.lat }, { lng: HOME.lng }, { lat: null, lng: null }]) {
        const response = await mark(id, body)
        assert.equal(response.status, 400)
        assert.equal(response.body.code, 'geo_required')
      }
      assert.equal((await recordsOf(id)).length, 0)
    })

    it('turned on: impossible coordinates are rejected', async () => {
      await geoOn()
      const id = await newEmployee()
      assert.equal((await mark(id, { lat: 91, lng: 0 })).body.code, 'geo_invalid')
      assert.equal((await mark(id, { lat: 0, lng: 181 })).body.code, 'geo_invalid')
      assert.equal((await mark(id, { lat: -91, lng: 0 })).body.code, 'geo_invalid')
      assert.equal((await recordsOf(id)).length, 0)
    })

    it('inside the radius: recorded as valid, with the coordinates', async () => {
      await geoOn()
      const id = await newEmployee()
      const response = await mark(id, { ...north(50) })
      assert.equal(response.status, 201)
      assert.equal(response.body.location_valid, true)
      const row = (await sql('SELECT location_lat, location_lng FROM attendance_records WHERE employee_id = $1', [id])).rows[0]
      assert.ok(Math.abs(row.location_lat - north(50).lat) < 1e-9)
    })

    it('outside the radius: rejected, nothing recorded, and the attempt is logged', async () => {
      await geoOn()
      const id = await newEmployee()
      const response = await mark(id, { ...north(500), accuracy: 10 })
      assert.equal(response.status, 403)
      assert.equal(response.body.code, 'geo_out_of_range')
      assert.equal((await recordsOf(id)).length, 0)
      const attempt = (await sql('SELECT distance_meters, accuracy_reported FROM geo_blocked_attempts WHERE employee_id = $1', [id])).rows
      assert.equal(attempt.length, 1)
      assert.ok(Math.abs(attempt[0].distance_meters - 500) < 2)
      assert.equal(attempt[0].accuracy_reported, 10)
    })

    it('the GPS accuracy gives slack: just outside the radius passes, but is not marked as strictly valid', async () => {
      await geoOn(100)
      const id = await newEmployee()
      const response = await mark(id, { ...north(130), accuracy: 40 })
      assert.equal(response.status, 201)
      assert.equal(response.body.location_valid, false)
    })

    it(`the slack is capped at ${ACCURACY_CAP_METERS} m, however bad the reported accuracy`, async () => {
      await geoOn(100)
      const id = await newEmployee()
      assert.equal((await mark(id, { ...north(250), accuracy: 5000 })).body.code, 'geo_out_of_range')
      assert.equal((await mark(id, { ...north(190), accuracy: 5000 })).status, 201)
    })

    it('a negative accuracy never shrinks the radius', async () => {
      await geoOn(100)
      const id = await newEmployee()
      const response = await mark(id, { ...north(90), accuracy: -500 })
      assert.equal(response.status, 201)
      assert.equal(response.body.location_valid, true)
    })

    it('a place without coordinates fails closed instead of letting everyone in', async () => {
      await geoOn()
      await sql('UPDATE business SET location_lat = NULL, location_lng = NULL')
      const id = await newEmployee()
      const response = await mark(id, { ...north(0) })
      assert.equal(response.status, 409)
      assert.equal(response.body.code, 'geo_misconfigured')
      assert.equal((await recordsOf(id)).length, 0)
    })

    it('a site with its own settings is judged by them, not the business ones', async () => {
      await sql('UPDATE business SET geo_enabled = false')
      const site = (
        await sql(
          "INSERT INTO locations (name, geo_enabled, lat, lng, geo_radius_meters) VALUES ('Strict', true, $1, $2, 30) RETURNING id",
          [HOME.lat, HOME.lng],
        )
      ).rows[0].id
      const id = await newEmployee()
      assert.equal((await mark(id, { location_id: site })).body.code, 'geo_required')
      assert.equal((await mark(id, { location_id: site, ...north(200) })).body.code, 'geo_out_of_range')
      assert.equal((await mark(id, { location_id: site, ...north(10) })).status, 201)
    })

    it('a site with verification off does not use the business verification', async () => {
      await geoOn()
      const site = (await sql("INSERT INTO locations (name, geo_enabled) VALUES ('Open', false) RETURNING id")).rows[0].id
      const id = await newEmployee()
      assert.equal((await mark(id, { location_id: site })).status, 201)
    })

    it('the location is checked before anything is written, so a wrong PIN is judged first', async () => {
      await geoOn()
      const id = await newEmployee({ pin: '1234' })
      assert.equal((await mark(id, { pin: '0000', ...north(0) })).body.code, 'pin_invalid')
      assert.equal((await mark(id, { pin: '1234', ...north(900) })).body.code, 'geo_out_of_range')
      assert.equal((await mark(id, { pin: '1234', ...north(0) })).status, 201)
    })
  })

  describe('distance', () => {
    it('matches known values', () => {
      assert.ok(Math.abs(distanceMeters(HOME.lat, HOME.lng, HOME.lat, HOME.lng)) < 1e-6)
      assert.ok(Math.abs(distanceMeters(0, 0, 0, 1) - 111322) < 50)
      assert.ok(Math.abs(distanceMeters(HOME.lat, HOME.lng, north(250).lat, north(250).lng) - 250) < 0.5)
    })
  })

  describe('live updates', () => {
    it('publishes an event for each recorded mark and none for a rejected one', async () => {
      const events: { type: string; data: Record<string, unknown> }[] = []
      const stop = ctx.app.events.subscribe((event) => events.push(event))
      const id = await newEmployee({ pin: '1234' })
      await mark(id, { pin: '0000' })
      await mark(id, { pin: '1234' })
      stop()
      assert.equal(events.length, 1)
      assert.equal(events[0]?.type, 'attendance')
      assert.equal(events[0]?.data.employee_id, id)
    })
  })
})
