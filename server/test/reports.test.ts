import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { Client, createAdmin, createTestApp, setupOwner } from './helpers.ts'
import type { AdminHandle, TestContext } from './helpers.ts'

// A minimal but real zip header, which is how every .xlsx file starts.
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rest of a workbook')])
const PDF = Buffer.from('%PDF-1.4 minimal')

describe('reports', () => {
  let ctx: TestContext
  let owner: Client
  let admin: AdminHandle
  let anon: Client
  let ownerId: string

  before(async () => {
    ctx = await createTestApp()
    owner = await setupOwner(ctx)
    admin = await createAdmin(ctx, owner)
    anon = new Client(ctx.app)
    ownerId = (await owner.get('/api/auth/me')).body.employee.id
  })
  after(async () => {
    await ctx.close()
  })

  describe('data for the attendance report', () => {
    let eva: string
    let inactive: string

    before(async () => {
      eva = (await owner.post('/api/employees', { name: 'Eva', last_name: 'Alpha', dni: '111', puesto: 'Clerk' })).body.id
      inactive = (await owner.post('/api/employees', { name: 'Ina', last_name: 'Beta' })).body.id
      await owner.patch(`/api/employees/${inactive}`, { active: false })
      await owner.put('/api/schedules', { blocks: [{ days_of_week: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00' }] })
      await owner.put('/api/holidays', {}).catch(() => {})
      await owner.post('/api/holidays', { date: '2027-01-01', name: 'New year' })
      await owner.post('/api/justifications', { employee_id: eva, date: '2027-01-05', type: 'licencia' })
      await owner.put('/api/overtime', { employee_id: eva, date: '2027-01-06', minutes_authorized: 45 })
      await owner.put('/api/schedule-exceptions', { date: '2027-01-07', reason: 'Closed' })
      // Two marks on a known day, recorded at known instants in the business timezone (America/Lima, UTC-5).
      await ctx.pool.query(
        `INSERT INTO attendance_records (employee_id, type, timestamp) VALUES
           ($1, 'checkin',  '2027-01-04T13:05:00Z'),
           ($1, 'checkout', '2027-01-04T23:00:00Z')`,
        [eva],
      )
    })

    it('returns everything the report needs, in the business timezone', async () => {
      const response = await admin.client.get('/api/reports/data?from=2027-01-01&to=2027-01-31')
      assert.equal(response.status, 200)
      const data = response.body
      assert.equal(data.business.name, 'Test Business')
      assert.equal(data.business.timezone, 'America/Lima')
      assert.deepEqual(data.records.map((record: { date: string; time: string; type: string }) => [record.date, record.time, record.type]), [
        ['2027-01-04', '08:05', 'checkin'],
        ['2027-01-04', '18:00', 'checkout'],
      ])
      assert.equal(data.justifications.length, 1)
      assert.equal(data.holidays.length, 1)
      assert.equal(data.overtime_authorizations[0].minutes_authorized, 45)
      assert.equal(data.schedule_exceptions[0].reason, 'Closed')
      assert.equal(data.schedules.length, 1)
      // The app decides which schedule applies from these two fields. Without `active` every day looks like a
      // rest day, and the statistics and the reports show no working days at all.
      assert.equal(data.schedules[0].active, true)
      assert.equal(data.schedules[0].is_default, true)
    })

    it('lists active employees only, and never the owner', async () => {
      const data = (await owner.get('/api/reports/data?from=2027-01-01&to=2027-01-31')).body
      const ids = data.employees.map((employee: { id: string }) => employee.id)
      assert.ok(ids.includes(eva))
      assert.ok(!ids.includes(inactive))
      assert.ok(!ids.includes(ownerId))
      assert.ok(!ids.includes(admin.employeeId) === false, 'administrators are reported like any other employee')
      assert.equal(data.employees.find((employee: { id: string }) => employee.id === eva).dni, '111')
    })

    it('reports each person from the day they were added, or from their first mark if earlier', async () => {
      const day = async (offset: number) =>
        (await ctx.pool.query("SELECT to_char((now() AT TIME ZONE 'America/Lima')::date + $1::int, 'YYYY-MM-DD') AS d", [offset])).rows[0].d as string
      const today = await day(0)
      const monthAgo = await day(-30)

      // Eva was added today and her only mark is in the future: she is reported from today, not from the range start.
      const data = (await owner.get(`/api/reports/data?from=${monthAgo}&to=${today}`)).body
      assert.equal(data.employees.find((employee: { id: string }) => employee.id === eva).report_from, today)

      // Someone with a mark before they were added is reported from that first mark.
      const early = (await owner.post('/api/employees', { name: 'Earl', last_name: 'Early' })).body.id
      await ctx.pool.query("INSERT INTO attendance_records (employee_id, type, timestamp) VALUES ($1, 'checkin', now() - interval '10 days')", [early])
      const tenDaysAgo = await day(-10)
      const withEarly = (await owner.get(`/api/reports/data?from=${monthAgo}&to=${today}`)).body
      assert.equal(withEarly.employees.find((employee: { id: string }) => employee.id === early).report_from, tenDaysAgo)

      // ...but never before the start of the range that was asked for.
      const clipped = (await owner.get(`/api/reports/data?from=${await day(-5)}&to=${today}`)).body
      assert.equal(clipped.employees.find((employee: { id: string }) => employee.id === early).report_from, await day(-5))
    })

    it('only includes what falls inside the range', async () => {
      const data = (await owner.get('/api/reports/data?from=2027-02-01&to=2027-02-28')).body
      assert.equal(data.records.length, 0)
      assert.equal(data.justifications.length, 0)
      assert.equal(data.holidays.length, 0)
      assert.equal(data.overtime_authorizations.length, 0)
      assert.equal(data.schedule_exceptions.length, 0)
    })

    it('rejects a reversed, oversized or malformed range', async () => {
      assert.equal((await owner.get('/api/reports/data?from=2027-02-01&to=2027-01-01')).status, 400)
      assert.equal((await owner.get('/api/reports/data?from=2020-01-01&to=2027-01-01')).body.code, 'range_too_long')
      assert.equal((await owner.get('/api/reports/data?from=x&to=y')).status, 400)
      assert.equal((await owner.get('/api/reports/data')).status, 400)
    })

    it('is not available without a session', async () => {
      assert.equal((await anon.get('/api/reports/data?from=2027-01-01&to=2027-01-31')).status, 401)
    })
  })

  describe('saved files', () => {
    const meta = { file_name: 'attendance_2027-01.xlsx', format: 'xlsx', date_from: '2027-01-01', date_to: '2027-01-31', employee_count: '3' }

    function formBody(file: Buffer, fields: Record<string, string>, filename = 'x.bin') {
      const boundary = '----qras-report-boundary'
      const parts: Buffer[] = []
      for (const [name, value] of Object.entries(fields)) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
      }
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`))
      parts.push(file, Buffer.from(`\r\n--${boundary}--\r\n`))
      return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
    }

    const archive = (client: Client, file: Buffer, fields: Record<string, string>) => {
      const { payload, headers } = formBody(file, fields)
      return client.request('POST', '/api/reports', payload, headers)
    }

    it('are archived, listed and downloaded again byte for byte', async () => {
      const created = await archive(admin.client, XLSX, meta)
      assert.equal(created.status, 201)
      assert.equal(created.body.format, 'xlsx')
      assert.equal(created.body.size_bytes, XLSX.length)
      assert.equal(created.body.employee_count, 3)
      assert.equal(created.body.created_by_email, admin.email)

      const list = await owner.get('/api/reports')
      assert.ok(list.body.some((report: { id: string }) => report.id === created.body.id))

      const download = await ctx.app.inject({ method: 'GET', url: `/api/reports/${created.body.id}/file`, headers: { cookie: owner.cookie } })
      assert.equal(download.statusCode, 200)
      assert.equal(download.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      assert.match(String(download.headers['content-disposition']), /^attachment; filename\*=UTF-8''attendance_2027-01\.xlsx$/)
      assert.ok(download.rawPayload.equals(XLSX))
    })

    it('accept a PDF too', async () => {
      const created = await archive(owner, PDF, { ...meta, format: 'pdf', file_name: 'a.pdf' })
      assert.equal(created.status, 201)
      const download = await ctx.app.inject({ method: 'GET', url: `/api/reports/${created.body.id}/file`, headers: { cookie: owner.cookie } })
      assert.equal(download.headers['content-type'], 'application/pdf')
    })

    it('reject a file that is not what it claims to be', async () => {
      const html = Buffer.from('<html><script>alert(1)</script></html>')
      const fake = await archive(owner, html, meta)
      assert.equal(fake.status, 400)
      assert.equal(fake.body.code, 'invalid_file')
      assert.equal((await archive(owner, XLSX, { ...meta, format: 'pdf' })).status, 400)
    })

    it('reject missing or invalid details', async () => {
      assert.equal((await archive(owner, XLSX, { ...meta, format: 'exe' })).status, 400)
      assert.equal((await archive(owner, XLSX, { ...meta, date_from: 'soon' })).status, 400)
      const { file_name: _omitted, ...withoutName } = meta
      assert.equal((await archive(owner, XLSX, withoutName)).status, 400)
      assert.equal((await owner.post('/api/reports', {})).status, 400)
    })

    it('are never reachable without a session', async () => {
      const created = await archive(owner, XLSX, meta)
      const response = await ctx.app.inject({ method: 'GET', url: `/api/reports/${created.body.id}/file` })
      assert.equal(response.statusCode, 401)
      assert.equal((await anon.get('/api/reports')).status, 401)
    })

    it('can be deleted by the owner only, and the file goes with the row', async () => {
      const created = await archive(owner, XLSX, meta)
      const file = path.join(ctx.config.dataDir, 'reports', created.body.storage_path)
      assert.ok(fs.existsSync(file))
      assert.equal((await admin.client.delete(`/api/reports/${created.body.id}`)).status, 403)
      assert.ok(fs.existsSync(file))
      assert.equal((await owner.delete(`/api/reports/${created.body.id}`)).status, 200)
      assert.ok(!fs.existsSync(file))
      assert.equal((await owner.delete(`/api/reports/${created.body.id}`)).status, 404)
    })

    it('a file name cannot make the server read or write elsewhere', async () => {
      const created = await archive(owner, XLSX, { ...meta, file_name: '../../etc/passwd' })
      assert.equal(created.status, 201)
      // The file lives under a server-generated name, whatever the label says.
      assert.match(created.body.storage_path, /^[0-9a-f-]{36}\.xlsx$/)
      // The label itself is cleaned of path separators.
      assert.ok(!/[\/]/.test(created.body.file_name), created.body.file_name)
      assert.ok(!created.body.file_name.startsWith('.'))
      const download = await ctx.app.inject({ method: 'GET', url: `/api/reports/${created.body.id}/file`, headers: { cookie: owner.cookie } })
      assert.equal(download.statusCode, 200)
      assert.ok(!decodeURIComponent(String(download.headers['content-disposition'])).includes('/'))
    })
  })
})
