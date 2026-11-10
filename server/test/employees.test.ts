import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Client, OWNER, createAdmin, createTestApp, setupOwner } from './helpers.ts'
import type { AdminHandle, TestContext } from './helpers.ts'

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

describe('employees, PIN and administrators', () => {
  let ctx: TestContext
  let owner: Client
  let admin: AdminHandle
  let ownerEmployeeId: string

  before(async () => {
    ctx = await createTestApp()
    owner = await setupOwner(ctx)
    admin = await createAdmin(ctx, owner)
    ownerEmployeeId = (await owner.get('/api/auth/me')).body.employee.id
  })
  after(async () => {
    await ctx.close()
  })

  describe('creating and listing', () => {
    it('creates an employee with a PIN that is stored only as a hash and never returned', async () => {
      const response = await owner.post('/api/employees', { name: 'Eva', last_name: 'Employee', dni: '123', pin: '4321' })
      assert.equal(response.status, 201)
      assert.equal(response.body.pin_enabled, true)
      assert.equal('pin_hash' in response.body, false)
      const row = (await ctx.pool.query('SELECT pin_hash FROM employees WHERE id = $1', [response.body.id])).rows[0]
      assert.ok(row.pin_hash.startsWith('$argon2'))
      assert.ok(!row.pin_hash.includes('4321'))
      const list = await owner.get('/api/employees')
      assert.ok(list.body.every((employee: object) => !('pin_hash' in employee)))
    })

    it('rejects a PIN that is not exactly four digits', async () => {
      for (const pin of ['123', '12345', 'abcd', '12 4']) {
        const response = await owner.post('/api/employees', { name: 'Bad', last_name: 'Pin', pin })
        assert.equal(response.status, 400, `pin ${pin}`)
      }
    })

    it('rejects an empty name', async () => {
      assert.equal((await owner.post('/api/employees', { name: ' ', last_name: 'X' })).status, 400)
    })

    it('ignores fields it does not know, so a client cannot set protected columns', async () => {
      const response = await owner.post('/api/employees', {
        name: 'Mal',
        last_name: 'Lory',
        user_id: '00000000-0000-0000-0000-000000000001',
        pin_hash: 'x',
        permissions: { manage_settings: true },
      })
      assert.equal(response.status, 201)
      const row = (await ctx.pool.query('SELECT user_id, pin_hash, permissions FROM employees WHERE id = $1', [response.body.id])).rows[0]
      assert.equal(row.user_id, null)
      assert.equal(row.pin_hash, null)
      assert.deepEqual(row.permissions, {})
    })

    it('updates, deactivates and manages the PIN', async () => {
      const created = await owner.post('/api/employees', { name: 'Una', last_name: 'Update' })
      const id = created.body.id
      const updated = await owner.patch(`/api/employees/${id}`, { puesto: 'Cashier', pin: '1111' })
      assert.equal(updated.body.puesto, 'Cashier')
      assert.equal(updated.body.pin_enabled, true)
      assert.equal((await owner.patch(`/api/employees/${id}`, { remove_pin: true })).body.pin_enabled, false)
      assert.equal((await owner.put(`/api/employees/${id}/pin`, { pin: '2222' })).status, 200)
      assert.equal((await owner.delete(`/api/employees/${id}/pin`)).status, 200)
      assert.equal((await owner.patch(`/api/employees/${id}`, { active: false })).body.active, false)
    })

    it('imports several employees, adding a schedule for those with their own days', async () => {
      const response = await owner.post('/api/employees/import', {
        rows: [
          { name: 'Ana', last_name: 'Uno', dni: '1' },
          { name: 'Beto', last_name: 'Dos', puesto: 'Driver', days_of_week: [1, 3, 5] },
          // The CSV screen sends null for "follows the business schedule".
          { name: 'Cleo', last_name: 'Tres', dni: '', puesto: '', days_of_week: null },
        ],
      })
      assert.equal(response.status, 201)
      assert.equal(response.body.length, 3)
      const schedules = (await ctx.pool.query('SELECT employee_id, days_of_week FROM schedules')).rows
      assert.equal(schedules.length, 1)
      assert.deepEqual(schedules[0].days_of_week, [1, 3, 5])
    })
  })

  describe('what an administrator without permissions may and may not do', () => {
    it('can create and edit regular employees', async () => {
      const created = await admin.client.post('/api/employees', { name: 'Eric', last_name: 'Edit' })
      assert.equal(created.status, 201)
      assert.equal((await admin.client.patch(`/api/employees/${created.body.id}`, { puesto: 'Clerk' })).status, 200)
    })

    it('cannot create another administrator', async () => {
      const response = await admin.client.post('/api/employees', { name: 'Sneaky', last_name: 'Admin', role: 'admin' })
      assert.equal(response.status, 403)
    })

    it('cannot promote an employee to administrator', async () => {
      const created = await owner.post('/api/employees', { name: 'Pro', last_name: 'Moted' })
      assert.equal((await admin.client.patch(`/api/employees/${created.body.id}`, { role: 'admin' })).status, 403)
    })

    it('cannot edit the owner or another administrator', async () => {
      const other = await createAdmin(ctx, owner)
      assert.equal((await admin.client.patch(`/api/employees/${ownerEmployeeId}`, { name: 'Hacked' })).status, 403)
      assert.equal((await admin.client.patch(`/api/employees/${other.employeeId}`, { name: 'Hacked' })).status, 403)
      assert.equal((await admin.client.put(`/api/employees/${ownerEmployeeId}/pin`, { pin: '9999' })).status, 403)
    })

    it('cannot grant permissions, invite, or reset passwords', async () => {
      const other = await createAdmin(ctx, owner)
      assert.equal(
        (await admin.client.put(`/api/employees/${other.employeeId}/permissions`, { permission: 'manage_settings', value: true })).status,
        403,
      )
      assert.equal(
        (await admin.client.put(`/api/employees/${admin.employeeId}/permissions`, { permission: 'manage_settings', value: true })).status,
        403,
      )
      assert.equal((await admin.client.post(`/api/employees/${other.employeeId}/invite`, { email: 'x@example.com' })).status, 403)
      assert.equal((await admin.client.post(`/api/employees/${other.employeeId}/reset-link`)).status, 403)
    })
  })

  describe('owner protections', () => {
    it('the owner cannot be deactivated or change role', async () => {
      assert.equal((await owner.patch(`/api/employees/${ownerEmployeeId}`, { active: false })).status, 400)
      assert.equal((await owner.patch(`/api/employees/${ownerEmployeeId}`, { role: 'admin' })).status, 400)
    })

    it('there can only ever be one owner', async () => {
      const created = await owner.post('/api/employees', { name: 'Not', last_name: 'Owner', role: 'owner' })
      assert.equal(created.status, 400)
      await assert.rejects(ctx.pool.query("INSERT INTO employees (name, last_name, role) VALUES ('Two', 'Owners', 'owner')"))
    })
  })

  describe('permissions', () => {
    it('lets the owner grant and revoke a permission on an administrator', async () => {
      const granted = await owner.put(`/api/employees/${admin.employeeId}/permissions`, { permission: 'manage_settings', value: true })
      assert.equal(granted.body.permissions.manage_settings, true)
      const revoked = await owner.put(`/api/employees/${admin.employeeId}/permissions`, { permission: 'manage_settings', value: false })
      assert.equal(revoked.body.permissions.manage_settings, false)
    })

    it('rejects unknown permissions and non-administrators', async () => {
      assert.equal((await owner.put(`/api/employees/${admin.employeeId}/permissions`, { permission: 'delete_everything', value: true })).status, 400)
      const regular = await owner.post('/api/employees', { name: 'Reg', last_name: 'Ular' })
      assert.equal((await owner.put(`/api/employees/${regular.body.id}/permissions`, { permission: 'manage_settings', value: true })).status, 400)
    })
  })

  describe('invitations', () => {
    it('are single use', async () => {
      const created = await owner.post('/api/employees', { name: 'Once', last_name: 'Only', role: 'admin' })
      const invite = await owner.post(`/api/employees/${created.body.id}/invite`, { email: 'once@example.com' })
      const token = new URL(invite.body.link).searchParams.get('token')
      assert.equal((await new Client(ctx.app).post('/api/auth/accept-invite', { token, password: 'a long password' })).status, 200)
      assert.equal((await new Client(ctx.app).post('/api/auth/accept-invite', { token, password: 'another password' })).status, 404)
    })

    it('expire', async () => {
      const created = await owner.post('/api/employees', { name: 'Too', last_name: 'Late', role: 'admin' })
      const invite = await owner.post(`/api/employees/${created.body.id}/invite`, { email: 'late@example.com' })
      const token = new URL(invite.body.link).searchParams.get('token')
      await ctx.pool.query("UPDATE auth_tokens SET expires_at = now() - interval '1 minute' WHERE employee_id = $1", [created.body.id])
      assert.equal((await new Client(ctx.app).post('/api/auth/accept-invite', { token, password: 'a long password' })).status, 404)
    })

    it('a newer link replaces the older one', async () => {
      const created = await owner.post('/api/employees', { name: 'Re', last_name: 'Sent', role: 'admin' })
      const first = await owner.post(`/api/employees/${created.body.id}/invite`, { email: 'resent@example.com' })
      const second = await owner.post(`/api/employees/${created.body.id}/invite`, { email: 'resent@example.com' })
      const firstToken = new URL(first.body.link).searchParams.get('token')
      const secondToken = new URL(second.body.link).searchParams.get('token')
      assert.equal((await new Client(ctx.app).post('/api/auth/accept-invite', { token: firstToken, password: 'a long password' })).status, 404)
      assert.equal((await new Client(ctx.app).post('/api/auth/accept-invite', { token: secondToken, password: 'a long password' })).status, 200)
    })

    it('cannot reuse an email that already has an account', async () => {
      const created = await owner.post('/api/employees', { name: 'Du', last_name: 'Plicate', role: 'admin' })
      const response = await owner.post(`/api/employees/${created.body.id}/invite`, { email: OWNER.email })
      assert.equal(response.status, 409)
    })

    it('only administrators can be invited', async () => {
      const regular = await owner.post('/api/employees', { name: 'Reg', last_name: 'Employee' })
      assert.equal((await owner.post(`/api/employees/${regular.body.id}/invite`, { email: 'reg@example.com' })).status, 400)
    })

    it('shows the pending invitation on the employee list', async () => {
      const created = await owner.post('/api/employees', { name: 'Pen', last_name: 'Ding', role: 'admin' })
      assert.equal(created.body.invite_sent_at, null)
      await owner.post(`/api/employees/${created.body.id}/invite`, { email: 'pending@example.com' })
      const list = await owner.get('/api/employees')
      assert.ok(list.body.find((employee: { id: string }) => employee.id === created.body.id).invite_sent_at)
    })
  })

  describe('deactivating an administrator', () => {
    it('ends their access immediately, even with a valid session', async () => {
      const temp = await createAdmin(ctx, owner)
      assert.equal((await temp.client.get('/api/employees')).status, 200)
      await owner.patch(`/api/employees/${temp.employeeId}`, { active: false })
      assert.equal((await temp.client.get('/api/employees')).status, 401)
      const login = await new Client(ctx.app).post('/api/auth/login', { email: temp.email, password: temp.password })
      assert.equal(login.status, 401)
    })
  })

  describe('password reset links', () => {
    it('let an administrator choose a new password and close their old sessions', async () => {
      const temp = await createAdmin(ctx, owner)
      const reset = await owner.post(`/api/employees/${temp.employeeId}/reset-link`)
      assert.equal(reset.status, 200)
      const token = new URL(reset.body.link).searchParams.get('token')
      assert.equal((await new Client(ctx.app).post('/api/auth/reset-password', { token, password: 'brand new password' })).status, 200)
      assert.equal((await temp.client.get('/api/employees')).status, 401)
      const login = await new Client(ctx.app).post('/api/auth/login', { email: temp.email, password: 'brand new password' })
      assert.equal(login.status, 200)
      assert.equal((await new Client(ctx.app).post('/api/auth/reset-password', { token, password: 'yet another one' })).status, 404)
    })

    it('forgot-password answers the same whether or not the email exists, and never emails without SMTP', async () => {
      const known = await new Client(ctx.app).post('/api/auth/forgot-password', { email: OWNER.email })
      const unknown = await new Client(ctx.app).post('/api/auth/forgot-password', { email: 'nobody@example.com' })
      assert.deepEqual(known.body, unknown.body)
      assert.equal(known.body.email_configured, false)
    })
  })

  describe('photos', () => {
    it('stores and serves a real image', async () => {
      const created = await owner.post('/api/employees', { name: 'Pho', last_name: 'To' })
      const id = created.body.id
      const upload = await owner.upload(`/api/employees/${id}/photo`, 'me.png', PNG, 'image/png')
      assert.equal(upload.status, 200)
      assert.match(upload.body.photo_url, new RegExp(`^/api/employees/${id}/photo\\?v=`))
      const served = await ctx.app.inject({ method: 'GET', url: `/api/employees/${id}/photo`, headers: { cookie: owner.cookie } })
      assert.equal(served.statusCode, 200)
      assert.equal(served.headers['content-type'], 'image/png')
      assert.equal((await owner.delete(`/api/employees/${id}/photo`)).status, 200)
      const gone = await ctx.app.inject({ method: 'GET', url: `/api/employees/${id}/photo`, headers: { cookie: owner.cookie } })
      assert.equal(gone.statusCode, 404)
    })

    it('rejects a file that is not an image, whatever its name or declared type', async () => {
      const created = await owner.post('/api/employees', { name: 'Not', last_name: 'Image' })
      const html = Buffer.from('<script>alert(1)</script>')
      const response = await owner.upload(`/api/employees/${created.body.id}/photo`, 'evil.png', html, 'image/png')
      assert.equal(response.status, 400)
      assert.equal(response.body.code, 'invalid_image')
    })

    it('is not served to people who are not signed in', async () => {
      const created = await owner.post('/api/employees', { name: 'Pri', last_name: 'Vate' })
      await owner.upload(`/api/employees/${created.body.id}/photo`, 'me.png', PNG, 'image/png')
      const response = await ctx.app.inject({ method: 'GET', url: `/api/employees/${created.body.id}/photo` })
      assert.equal(response.statusCode, 401)
    })
  })
})
