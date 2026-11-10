import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Client, createAdmin, createTestApp, setupOwner } from './helpers.ts'
import type { AdminHandle, TestContext } from './helpers.ts'

describe('business settings, sites, departments and holidays', () => {
  let ctx: TestContext
  let owner: Client
  let plain: AdminHandle
  let settingsAdmin: AdminHandle
  let holidaysAdmin: AdminHandle

  before(async () => {
    ctx = await createTestApp()
    owner = await setupOwner(ctx)
    plain = await createAdmin(ctx, owner)
    settingsAdmin = await createAdmin(ctx, owner, { permissions: { manage_settings: true } })
    holidaysAdmin = await createAdmin(ctx, owner, { permissions: { manage_holidays: true } })
  })
  after(async () => {
    await ctx.close()
  })

  describe('business', () => {
    it('is readable by any account', async () => {
      for (const client of [owner, plain.client]) {
        const response = await client.get('/api/business')
        assert.equal(response.status, 200)
        assert.equal(response.body.name, 'Test Business')
      }
    })

    it('lets the owner change every setting', async () => {
      const response = await owner.patch('/api/business', {
        name: 'Renamed Shop',
        tolerance_minutes: 10,
        geo_enabled: true,
        geo_radius_meters: 150,
        location_lat: -12.05,
        location_lng: -77.04,
        location_address: 'Main street 1',
        timezone: 'America/Bogota',
        locale: 'es',
      })
      assert.equal(response.status, 200)
      assert.equal(response.body.name, 'Renamed Shop')
      assert.equal(response.body.geo_radius_meters, 150)
      assert.equal(response.body.timezone, 'America/Bogota')
    })

    it('rejects invalid values', async () => {
      for (const body of [
        { tolerance_minutes: -1 },
        { tolerance_minutes: 500 },
        { timezone: 'Mars/Olympus' },
        { location_lat: 120 },
        { location_lng: -200 },
        { geo_radius_meters: 0 },
        { name: '  ' },
        { locale: 'fr' },
      ]) {
        assert.equal((await owner.patch('/api/business', body)).status, 400, JSON.stringify(body))
      }
    })

    it('stays a single row however it is edited', async () => {
      const count = await ctx.pool.query('SELECT count(*)::int AS n FROM business')
      assert.equal(count.rows[0].n, 1)
      await assert.rejects(ctx.pool.query("INSERT INTO business (name) VALUES ('Second business')"))
    })

    it('an administrator with settings permission may only change the tolerance', async () => {
      assert.equal((await settingsAdmin.client.patch('/api/business', { tolerance_minutes: 7 })).body.tolerance_minutes, 7)
      assert.equal((await settingsAdmin.client.patch('/api/business', { name: 'Hijacked' })).status, 403)
      assert.equal((await settingsAdmin.client.patch('/api/business', { geo_enabled: false })).status, 403)
      assert.equal((await settingsAdmin.client.patch('/api/business', { tolerance_minutes: 7, geo_radius_meters: 5 })).status, 403)
    })

    it('an administrator without permission cannot change anything', async () => {
      assert.equal((await plain.client.patch('/api/business', { tolerance_minutes: 3 })).status, 403)
      assert.equal((await holidaysAdmin.client.patch('/api/business', { tolerance_minutes: 3 })).status, 403)
    })
  })

  describe('sites', () => {
    it('are created and edited by the owner only', async () => {
      const created = await owner.post('/api/locations', {
        name: 'Downtown',
        lat: -12.04,
        lng: -77.03,
        geo_enabled: true,
        geo_radius_meters: 80,
      })
      assert.equal(created.status, 201)
      assert.equal(created.body.geo_radius_meters, 80)
      const updated = await owner.patch(`/api/locations/${created.body.id}`, { name: 'Downtown HQ', active: false })
      assert.equal(updated.body.name, 'Downtown HQ')
      assert.equal(updated.body.active, false)
      assert.equal((await plain.client.post('/api/locations', { name: 'Nope' })).status, 403)
      assert.equal((await settingsAdmin.client.patch(`/api/locations/${created.body.id}`, { name: 'Nope' })).status, 403)
    })

    it('are listed for any account and validated', async () => {
      assert.ok((await plain.client.get('/api/locations')).body.length >= 1)
      assert.equal((await owner.post('/api/locations', { name: 'Bad', lat: 999 })).status, 400)
      assert.equal((await owner.post('/api/locations', { name: '' })).status, 400)
      assert.equal((await owner.patch('/api/locations/00000000-0000-4000-8000-000000000000', { name: 'x' })).status, 404)
    })
  })

  describe('departments', () => {
    it('are managed by the owner or an administrator with settings permission', async () => {
      const created = await settingsAdmin.client.post('/api/departments', { name: 'Sales' })
      assert.equal(created.status, 201)
      assert.equal((await owner.patch(`/api/departments/${created.body.id}`, { name: 'Sales team' })).body.name, 'Sales team')
      assert.equal((await owner.post('/api/departments', { name: 'Ops' })).status, 201)
    })

    it('are not managed by an administrator without that permission', async () => {
      assert.equal((await plain.client.post('/api/departments', { name: 'Nope' })).status, 403)
      assert.equal((await holidaysAdmin.client.post('/api/departments', { name: 'Nope' })).status, 403)
      // ...but any account can read them.
      assert.equal((await plain.client.get('/api/departments')).status, 200)
    })

    it('have unique names and leave their employees without a department when deleted', async () => {
      const created = await owner.post('/api/departments', { name: 'Warehouse' })
      assert.equal((await owner.post('/api/departments', { name: 'Warehouse' })).status, 409)
      const employee = await owner.post('/api/employees', { name: 'Wally', last_name: 'House', department_id: created.body.id })
      assert.equal(employee.body.department_id, created.body.id)
      assert.equal((await owner.delete(`/api/departments/${created.body.id}`)).status, 200)
      const after = (await owner.get('/api/employees')).body.find((row: { id: string }) => row.id === employee.body.id)
      assert.equal(after.department_id, null)
      assert.equal((await owner.delete(`/api/departments/${created.body.id}`)).status, 404)
    })
  })

  describe('holidays', () => {
    it('are managed by the owner or an administrator with holidays permission', async () => {
      const created = await holidaysAdmin.client.post('/api/holidays', { date: '2027-07-28', name: 'Independence day' })
      assert.equal(created.status, 201)
      assert.equal(created.body.date, '2027-07-28')
      assert.equal((await owner.post('/api/holidays', { date: '2027-12-25', name: 'Christmas' })).status, 201)
      const list = await plain.client.get('/api/holidays')
      assert.deepEqual(
        list.body.map((holiday: { date: string }) => holiday.date),
        ['2027-07-28', '2027-12-25'],
      )
      assert.equal((await holidaysAdmin.client.delete(`/api/holidays/${created.body.id}`)).status, 200)
    })

    it('are not managed by an administrator without that permission', async () => {
      assert.equal((await plain.client.post('/api/holidays', { date: '2027-01-01', name: 'New year' })).status, 403)
      assert.equal((await settingsAdmin.client.post('/api/holidays', { date: '2027-01-01', name: 'New year' })).status, 403)
    })

    it('reject a repeated date and a malformed one', async () => {
      await owner.post('/api/holidays', { date: '2027-05-01', name: 'Labour day' })
      assert.equal((await owner.post('/api/holidays', { date: '2027-05-01', name: 'Again' })).status, 409)
      assert.equal((await owner.post('/api/holidays', { date: '01/05/2027', name: 'Bad' })).status, 400)
    })
  })
})
