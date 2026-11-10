import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Client, createAdmin, createTestApp, setupOwner } from './helpers.ts'
import type { AdminHandle, TestContext } from './helpers.ts'

describe('attendance, absences, leave and overtime', () => {
  let ctx: TestContext
  let owner: Client
  let plain: AdminHandle
  let settingsAdmin: AdminHandle
  let anon: Client
  let employeeId: string

  before(async () => {
    ctx = await createTestApp()
    owner = await setupOwner(ctx)
    plain = await createAdmin(ctx, owner)
    settingsAdmin = await createAdmin(ctx, owner, { permissions: { manage_settings: true } })
    anon = new Client(ctx.app)
    employeeId = (await owner.post('/api/employees', { name: 'Rita', last_name: 'Records' })).body.id
  })
  after(async () => {
    await ctx.close()
  })

  describe('attendance', () => {
    it('lists the marks between two instants, without coordinates', async () => {
      const before = new Date(Date.now() - 60_000).toISOString()
      await anon.post('/api/public/checkin', { employee_id: employeeId, lat: -12.04, lng: -77.03 })
      const after = new Date(Date.now() + 60_000).toISOString()
      const response = await plain.client.get(`/api/attendance?start=${encodeURIComponent(before)}&end=${encodeURIComponent(after)}`)
      assert.equal(response.status, 200)
      assert.equal(response.body.length, 1)
      assert.equal(response.body[0].type, 'checkin')
      assert.equal('location_lat' in response.body[0], false)
      assert.equal('device_info' in response.body[0], false)
    })

    it('filters by employee and by range', async () => {
      const other = (await owner.post('/api/employees', { name: 'Otto', last_name: 'Other' })).body.id
      await anon.post('/api/public/checkin', { employee_id: other })
      const start = encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())
      const end = encodeURIComponent(new Date(Date.now() + 3_600_000).toISOString())
      assert.equal((await owner.get(`/api/attendance?start=${start}&end=${end}&employee_id=${other}`)).body.length, 1)
      const old = encodeURIComponent(new Date(Date.now() - 10 * 86_400_000).toISOString())
      const older = encodeURIComponent(new Date(Date.now() - 9 * 86_400_000).toISOString())
      assert.equal((await owner.get(`/api/attendance?start=${old}&end=${older}`)).body.length, 0)
    })

    it('rejects a malformed range', async () => {
      assert.equal((await owner.get('/api/attendance?start=yesterday&end=today')).status, 400)
      assert.equal((await owner.get('/api/attendance')).status, 400)
    })

    it('lists this month\'s rejected attempts with the employee name, and not older ones', async () => {
      await ctx.pool.query('UPDATE business SET geo_enabled = true, location_lat = -12.0464, location_lng = -77.0428')
      await anon.post('/api/public/checkin', { employee_id: employeeId, lat: -12.0, lng: -77.0, accuracy: 12 })
      await ctx.pool.query(
        `INSERT INTO geo_blocked_attempts (employee_id, attempted_lat, attempted_lng, distance_meters, created_at)
         VALUES ($1, 0, 0, 999, now() - interval '70 days')`,
        [employeeId],
      )
      const response = await plain.client.get('/api/geo-blocked-attempts')
      assert.equal(response.status, 200)
      assert.equal(response.body.length, 1)
      assert.equal(response.body[0].employee_name, 'Rita')
      assert.equal(response.body[0].accuracy_reported, 12)
      await ctx.pool.query('UPDATE business SET geo_enabled = false')
    })
  })

  describe('absence justifications', () => {
    it('are recorded, listed by date, year and employee, edited and deleted by any administrator', async () => {
      const created = await plain.client.post('/api/justifications', {
        employee_id: employeeId,
        date: '2027-04-12',
        date_to: '2027-04-14',
        type: 'descanso_medico',
        reason: 'Flu',
      })
      assert.equal(created.status, 201)
      assert.equal(created.body.status, 'approved')
      assert.equal(created.body.created_by !== null, true)
      assert.equal((await owner.get('/api/justifications?date=2027-04-12')).body.length, 1)
      assert.equal((await owner.get('/api/justifications?year=2027')).body.length, 1)
      assert.equal((await owner.get('/api/justifications?year=2026')).body.length, 0)
      assert.equal((await owner.get(`/api/justifications?employee_id=${employeeId}`)).body.length, 1)
      const updated = await settingsAdmin.client.patch(`/api/justifications/${created.body.id}`, { reason: 'Flu, recovered', date_to: null })
      assert.equal(updated.body.reason, 'Flu, recovered')
      assert.equal(updated.body.date_to, null)
      assert.equal((await plain.client.delete(`/api/justifications/${created.body.id}`)).status, 200)
      assert.equal((await plain.client.delete(`/api/justifications/${created.body.id}`)).status, 404)
    })

    it('allow only one per employee and start date', async () => {
      const body = { employee_id: employeeId, date: '2027-05-03', type: 'otro' }
      assert.equal((await owner.post('/api/justifications', body)).status, 201)
      assert.equal((await owner.post('/api/justifications', body)).status, 409)
    })

    it('reject bad input', async () => {
      assert.equal((await owner.post('/api/justifications', { employee_id: employeeId, date: '2027-05-10', date_to: '2027-05-01' })).status, 400)
      assert.equal((await owner.post('/api/justifications', { employee_id: employeeId, date: '2027-05-10', type: 'holiday' })).status, 400)
      assert.equal((await owner.post('/api/justifications', { employee_id: employeeId, date: '10-05-2027' })).status, 400)
      assert.equal((await owner.post('/api/justifications', { employee_id: '00000000-0000-4000-8000-000000000000', date: '2027-05-10' })).status, 404)
    })

    it('are approved or rejected only by the owner or an administrator with the settings permission', async () => {
      const pending = await owner.post('/api/justifications', { employee_id: employeeId, date: '2027-06-01', type: 'vacaciones', status: 'pending' })
      assert.equal(pending.body.status, 'pending')
      assert.equal((await plain.client.post(`/api/justifications/${pending.body.id}/status`, { status: 'approved' })).status, 403)
      assert.equal((await settingsAdmin.client.post(`/api/justifications/${pending.body.id}/status`, { status: 'approved' })).body.status, 'approved')
      assert.equal((await owner.post(`/api/justifications/${pending.body.id}/status`, { status: 'rejected' })).body.status, 'rejected')
      assert.equal((await owner.post(`/api/justifications/${pending.body.id}/status`, { status: 'maybe' })).status, 400)
    })
  })

  describe('vacation adjustments', () => {
    it('need the settings permission to add, and can be read by any account', async () => {
      assert.equal((await plain.client.post('/api/vacation-adjustments', { employee_id: employeeId, days: 5 })).status, 403)
      const created = await settingsAdmin.client.post('/api/vacation-adjustments', { employee_id: employeeId, days: -2, reason: 'Used last year' })
      assert.equal(created.status, 201)
      assert.equal(created.body.days, -2)
      const list = await plain.client.get('/api/vacation-adjustments')
      assert.equal(list.body.length, 1)
    })

    it('reject a zero or absurd adjustment', async () => {
      assert.equal((await owner.post('/api/vacation-adjustments', { employee_id: employeeId, days: 0 })).status, 400)
      assert.equal((await owner.post('/api/vacation-adjustments', { employee_id: employeeId, days: 9999 })).status, 400)
      assert.equal((await owner.post('/api/vacation-adjustments', { employee_id: employeeId, days: 1.5 })).status, 400)
    })

    it('the yearly entitlement is an employee setting', async () => {
      const updated = await plain.client.patch(`/api/employees/${employeeId}`, { vacation_days_per_year: 22 })
      assert.equal(updated.body.vacation_days_per_year, 22)
    })
  })

  describe('overtime authorizations', () => {
    it('are one per employee and day: sending again replaces it', async () => {
      const first = await plain.client.put('/api/overtime', { employee_id: employeeId, date: '2027-07-01', minutes_authorized: 60 })
      assert.equal(first.status, 200)
      assert.equal(first.body.compensation, 'pago')
      const second = await plain.client.put('/api/overtime', { employee_id: employeeId, date: '2027-07-01', minutes_authorized: 90, compensation: 'descanso', note: 'Inventory' })
      assert.equal(second.body.id, first.body.id)
      assert.equal(second.body.minutes_authorized, 90)
      assert.equal(second.body.compensation, 'descanso')
      assert.equal((await owner.get('/api/overtime?date=2027-07-01')).body.length, 1)
    })

    it('can be listed by range', async () => {
      await owner.put('/api/overtime', { employee_id: employeeId, date: '2027-07-05', minutes_authorized: 30 })
      assert.equal((await owner.get('/api/overtime?from=2027-07-01&to=2027-07-31')).body.length, 2)
      assert.equal((await owner.get('/api/overtime?from=2027-07-02&to=2027-07-31')).body.length, 1)
    })

    it('reject invalid input', async () => {
      assert.equal((await owner.put('/api/overtime', { employee_id: employeeId, date: '2027-07-09', minutes_authorized: -5 })).status, 400)
      assert.equal((await owner.put('/api/overtime', { employee_id: employeeId, date: '2027-07-09', minutes_authorized: 99999 })).status, 400)
      assert.equal((await owner.put('/api/overtime', { employee_id: employeeId, date: '2027-07-09', minutes_authorized: 10, compensation: 'gift' })).status, 400)
    })

    it('can be deleted by the owner only', async () => {
      const created = await owner.put('/api/overtime', { employee_id: employeeId, date: '2027-07-20', minutes_authorized: 15 })
      assert.equal((await plain.client.delete(`/api/overtime/${created.body.id}`)).status, 403)
      assert.equal((await owner.delete(`/api/overtime/${created.body.id}`)).status, 200)
    })
  })
})
