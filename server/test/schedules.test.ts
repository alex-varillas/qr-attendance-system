import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Client, createAdmin, createTestApp, setupOwner } from './helpers.ts'
import type { AdminHandle, TestContext } from './helpers.ts'

const WEEKDAYS = [1, 2, 3, 4, 5]
const block = (days: number[], start = '09:00', end = '18:00', breakStart: string | null = null, breakEnd: string | null = null) => ({
  days_of_week: days,
  start_time: start,
  end_time: end,
  break_start: breakStart,
  break_end: breakEnd,
})

describe('schedules and date exceptions', () => {
  let ctx: TestContext
  let owner: Client
  let admin: AdminHandle
  let employeeId: string
  let locationId: string

  before(async () => {
    ctx = await createTestApp()
    owner = await setupOwner(ctx)
    admin = await createAdmin(ctx, owner)
    employeeId = (await owner.post('/api/employees', { name: 'Sam', last_name: 'Schedule' })).body.id
    locationId = (await owner.post('/api/locations', { name: 'Branch' })).body.id
  })
  after(async () => {
    await ctx.close()
  })

  describe('schedule blocks', () => {
    it('sets the business schedule as the default, in several blocks', async () => {
      const response = await owner.put('/api/schedules', {
        blocks: [block(WEEKDAYS, '09:00', '18:00', '13:00', '14:00'), block([6], '09:00', '13:00')],
      })
      assert.equal(response.status, 200)
      assert.equal(response.body.length, 2)
      assert.ok(response.body.every((row: { is_default: boolean; employee_id: null }) => row.is_default && row.employee_id === null))
      assert.equal(response.body[0].break_start, '13:00:00')
    })

    it('replaces the previous blocks instead of adding to them', async () => {
      await owner.put('/api/schedules', { blocks: [block([1], '08:00', '12:00')] })
      const list = await owner.get('/api/schedules')
      assert.equal(list.body.filter((row: { employee_id: null; location_id: null }) => !row.employee_id && !row.location_id).length, 1)
    })

    it('keeps each scope separate', async () => {
      await owner.put('/api/schedules', { blocks: [block(WEEKDAYS)] })
      await owner.put('/api/schedules', { employee_id: employeeId, blocks: [block([2, 4], '10:00', '16:00')] })
      await owner.put('/api/schedules', { location_id: locationId, blocks: [block([1, 3], '07:00', '15:00')] })
      const list = (await owner.get('/api/schedules')).body
      assert.equal(list.length, 3)
      const own = list.find((row: { employee_id: string | null }) => row.employee_id === employeeId)
      assert.equal(own.is_default, false)
      assert.deepEqual(own.days_of_week, [2, 4])
      const site = list.find((row: { location_id: string | null }) => row.location_id === locationId)
      assert.equal(site.is_default, false)
    })

    it('rejects a day repeated across blocks', async () => {
      const response = await owner.put('/api/schedules', { blocks: [block([1, 2]), block([2, 3])] })
      assert.equal(response.status, 400)
      assert.equal(response.body.code, 'schedule_overlap')
      // The previous schedule is untouched.
      assert.ok((await owner.get('/api/schedules')).body.length >= 1)
    })

    it('rejects empty, malformed and ambiguous input', async () => {
      assert.equal((await owner.put('/api/schedules', { blocks: [] })).status, 400)
      assert.equal((await owner.put('/api/schedules', { blocks: [block([])] })).status, 400)
      assert.equal((await owner.put('/api/schedules', { blocks: [block([7])] })).status, 400)
      assert.equal((await owner.put('/api/schedules', { blocks: [block([1], '25:00', '18:00')] })).status, 400)
      assert.equal((await owner.put('/api/schedules', { employee_id: employeeId, location_id: locationId, blocks: [block([1])] })).status, 400)
      assert.equal((await owner.put('/api/schedules', { employee_id: '00000000-0000-4000-8000-000000000000', blocks: [block([1])] })).status, 404)
    })

    it('removes the own schedule of an employee or a site, never the business one', async () => {
      assert.equal((await owner.delete(`/api/schedules?employee_id=${employeeId}`)).status, 200)
      assert.equal((await owner.delete(`/api/schedules?location_id=${locationId}`)).status, 200)
      const list = (await owner.get('/api/schedules')).body
      assert.ok(list.every((row: { employee_id: string | null; location_id: string | null }) => !row.employee_id && !row.location_id))
      assert.ok(list.length >= 1)
      assert.equal((await owner.delete('/api/schedules')).status, 400)
    })

    it('can be edited by an administrator', async () => {
      assert.equal((await admin.client.put('/api/schedules', { employee_id: employeeId, blocks: [block([1])] })).status, 200)
    })
  })

  describe('the first default schedule (setup wizard)', () => {
    it('is created only when none exists', async () => {
      const fresh = await createTestApp()
      try {
        const freshOwner = await setupOwner(fresh)
        const first = await freshOwner.post('/api/schedules/default', { start_time: '08:00', end_time: '17:00' })
        assert.equal(first.status, 201)
        assert.deepEqual(first.body.days_of_week, [1, 2, 3, 4, 5])
        const second = await freshOwner.post('/api/schedules/default', { start_time: '10:00', end_time: '19:00' })
        assert.equal(second.status, 200)
        assert.equal(second.body.start_time, '08:00:00')
        assert.equal((await freshOwner.get('/api/schedules')).body.length, 1)
      } finally {
        await fresh.close()
      }
    })

    it('needs the settings permission', async () => {
      assert.equal((await admin.client.post('/api/schedules/default', { start_time: '08:00', end_time: '17:00' })).status, 403)
    })
  })

  describe('date exceptions', () => {
    it('create a non-working day for the whole business', async () => {
      const response = await owner.put('/api/schedule-exceptions', { date: '2027-03-01', reason: 'Inventory' })
      assert.equal(response.status, 200)
      assert.equal(response.body.start_time, null)
      assert.equal(response.body.reason, 'Inventory')
    })

    it('replace the one of the same scope and date instead of duplicating it', async () => {
      await owner.put('/api/schedule-exceptions', { date: '2027-03-02', start_time: '09:00', end_time: '12:00' })
      const second = await owner.put('/api/schedule-exceptions', { date: '2027-03-02', start_time: '10:00', end_time: '14:00' })
      assert.equal(second.body.start_time, '10:00:00')
      const same = (await owner.get('/api/schedule-exceptions')).body.filter((row: { date: string }) => row.date === '2027-03-02')
      assert.equal(same.length, 1)
    })

    it('keep employee, site and business exceptions apart on the same date', async () => {
      await owner.put('/api/schedule-exceptions', { date: '2027-03-03', reason: 'business' })
      await owner.put('/api/schedule-exceptions', { date: '2027-03-03', employee_id: employeeId, reason: 'employee' })
      await owner.put('/api/schedule-exceptions', { date: '2027-03-03', location_id: locationId, reason: 'site' })
      const same = (await owner.get('/api/schedule-exceptions')).body.filter((row: { date: string }) => row.date === '2027-03-03')
      assert.equal(same.length, 3)
    })

    it('need both times or neither, and one scope', async () => {
      assert.equal((await owner.put('/api/schedule-exceptions', { date: '2027-03-04', start_time: '09:00' })).status, 400)
      assert.equal((await owner.put('/api/schedule-exceptions', { date: '2027-03-04', end_time: '09:00' })).status, 400)
      assert.equal((await owner.put('/api/schedule-exceptions', { date: '2027-03-04', employee_id: employeeId, location_id: locationId })).status, 400)
      assert.equal((await owner.put('/api/schedule-exceptions', { date: 'tomorrow' })).status, 400)
    })

    it('can be removed', async () => {
      const created = await owner.put('/api/schedule-exceptions', { date: '2027-03-05', reason: 'x' })
      assert.equal((await admin.client.delete(`/api/schedule-exceptions/${created.body.id}`)).status, 200)
      assert.equal((await owner.delete(`/api/schedule-exceptions/${created.body.id}`)).status, 404)
    })
  })
})
