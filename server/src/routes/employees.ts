import fs from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PERMISSIONS, requireAuth, requireOwner } from '../auth.ts'
import type { AuthContext } from '../auth.ts'
import { many, one, withTransaction } from '../db/index.ts'
import type { Queryable } from '../db/index.ts'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts'
import { deletePhoto, findPhoto, savePhoto } from '../lib/files.ts'
import { baseUrl, parseBody, parseParams } from '../lib/http.ts'
import { sendMail } from '../lib/mailer.ts'
import { hashSecret, normalizeEmail } from '../lib/security.ts'
import { buildInsert, buildUpdate } from '../lib/sql.ts'
import { issueToken } from '../lib/tokens.ts'
import { dateSchema, emailSchema, optionalText, uuidSchema } from '../lib/validation.ts'

// pin_hash is never selected.
export const EMPLOYEE_COLUMNS = `e.id, e.user_id, e.name, e.last_name, e.doc_type, e.dni, e.birth_date, e.sex,
  e.email, e.phone, e.puesto, e.department_id, e.location_id, e.role, e.pin_enabled, e.active, e.permissions,
  e.vacation_days_per_year, e.photo_url, e.created_at,
  (SELECT t.created_at FROM auth_tokens t
    WHERE t.employee_id = e.id AND t.kind = 'invite' AND t.used_at IS NULL AND t.expires_at > now()
    ORDER BY t.created_at DESC LIMIT 1) AS invite_sent_at`

const idParams = z.object({ id: uuidSchema })
const pinSchema = z.string().regex(/^\d{4}$/, 'The PIN must be exactly 4 digits')

const fields = {
  name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  doc_type: z.string().trim().min(1).max(20),
  dni: optionalText(30),
  birth_date: dateSchema.nullable().optional(),
  sex: z.enum(['M', 'F', 'X']).nullable().optional(),
  email: optionalText(254),
  phone: optionalText(40),
  puesto: optionalText(100),
  department_id: uuidSchema.nullable().optional(),
  location_id: uuidSchema.nullable().optional(),
  vacation_days_per_year: z.number().int().min(0).max(365),
  active: z.boolean(),
  role: z.enum(['employee', 'admin']),
}

const createSchema = z.object({
  ...fields,
  doc_type: fields.doc_type.optional(),
  vacation_days_per_year: fields.vacation_days_per_year.optional(),
  active: fields.active.optional(),
  role: fields.role.optional(),
  pin: pinSchema.optional(),
})

const updateSchema = z.object({
  name: fields.name.optional(),
  last_name: fields.last_name.optional(),
  doc_type: fields.doc_type.optional(),
  dni: fields.dni,
  birth_date: fields.birth_date,
  sex: fields.sex,
  email: fields.email,
  phone: fields.phone,
  puesto: fields.puesto,
  department_id: fields.department_id,
  location_id: fields.location_id,
  vacation_days_per_year: fields.vacation_days_per_year.optional(),
  active: fields.active.optional(),
  role: fields.role.optional(),
  pin: pinSchema.optional(),
  remove_pin: z.boolean().optional(),
})

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        last_name: z.string().trim().min(1).max(100),
        dni: optionalText(30),
        puesto: optionalText(100),
        days_of_week: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      }),
    )
    .min(1)
    .max(500),
})

interface Target {
  id: string
  role: 'owner' | 'admin' | 'employee'
  user_id: string | null
  active: boolean
}

async function getTarget(db: Queryable, id: string): Promise<Target> {
  const target = await one<Target>(db, 'SELECT id, role, user_id, active FROM employees WHERE id = $1', [id])
  if (!target) throw notFound('Employee not found')
  return target
}

/** The owner manages everyone. An administrator manages regular employees only. */
function assertCanManage(auth: AuthContext, target: Target): void {
  if (auth.role === 'owner') return
  if (target.role !== 'employee') throw forbidden('Only the owner can change administrators')
}

async function selectEmployee(db: Queryable, id: string) {
  return one(db, `SELECT ${EMPLOYEE_COLUMNS} FROM employees e WHERE e.id = $1`, [id])
}

async function setPin(db: Queryable, employeeId: string, pin: string): Promise<void> {
  const hash = await hashSecret(pin)
  await db.query('UPDATE employees SET pin_hash = $1, pin_enabled = true, updated_at = now() WHERE id = $2', [hash, employeeId])
}

async function removePin(db: Queryable, employeeId: string): Promise<void> {
  await db.query('UPDATE employees SET pin_hash = NULL, pin_enabled = false, updated_at = now() WHERE id = $1', [employeeId])
}

export default async function employeeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/employees', async (request) => {
    requireAuth(request)
    return many(app.pool, `SELECT ${EMPLOYEE_COLUMNS} FROM employees e ORDER BY e.name, e.last_name`)
  })

  app.post('/employees', async (request, reply) => {
    const auth = requireAuth(request)
    const body = parseBody(createSchema, request)
    if (body.role === 'admin' && auth.role !== 'owner') throw forbidden('Only the owner can create administrators')
    const { pin, ...data } = body
    const pinHash = pin ? await hashSecret(pin) : null

    const created = await withTransaction(app.pool, async (tx) => {
      const insert = buildInsert('employees', data)
      const row = await one<{ id: string }>(tx, insert.text, insert.values)
      if (pinHash) {
        await tx.query('UPDATE employees SET pin_hash = $1, pin_enabled = true WHERE id = $2', [pinHash, row!.id])
      }
      return row!.id
    })
    return reply.status(201).send(await selectEmployee(app.pool, created))
  })

  app.post('/employees/import', async (request, reply) => {
    requireAuth(request)
    const { rows } = parseBody(importSchema, request)
    const inserted = await withTransaction(app.pool, async (tx) => {
      const result: unknown[] = []
      for (const row of rows) {
        const employee = await one<{ id: string }>(
          tx,
          `INSERT INTO employees (name, last_name, dni, puesto, role, active)
           VALUES ($1, $2, $3, $4, 'employee', true) RETURNING id`,
          [row.name, row.last_name, row.dni || null, row.puesto || null],
        )
        // A person who works different days than the business gets an own schedule.
        if (row.days_of_week && row.days_of_week.length > 0) {
          await tx.query(
            `INSERT INTO schedules (employee_id, name, days_of_week, start_time, end_time, is_default, active)
             VALUES ($1, 'Personalized schedule', $2, '08:00', '18:00', false, true)`,
            [employee!.id, row.days_of_week],
          )
        }
        result.push(await selectEmployee(tx, employee!.id))
      }
      return result
    })
    return reply.status(201).send(inserted)
  })

  app.patch('/employees/:id', async (request) => {
    const auth = requireAuth(request)
    const { id } = parseParams(idParams, request)
    const body = parseBody(updateSchema, request)
    const target = await getTarget(app.pool, id)
    assertCanManage(auth, target)

    const { pin, remove_pin, ...data } = body
    if (data.role !== undefined) {
      if (auth.role !== 'owner') throw forbidden('Only the owner can change roles')
      if (target.role === 'owner') throw badRequest('The role of the owner cannot be changed', 'owner_role')
      if (data.role === 'employee' && target.user_id) {
        throw badRequest('Remove the administrator account before making this person a regular employee', 'has_account')
      }
    }
    if (target.role === 'owner' && data.active === false) {
      throw badRequest('The owner cannot be deactivated', 'owner_active')
    }
    if (pin && remove_pin) throw badRequest('Send either a PIN or remove_pin, not both')
    const pinHash = pin ? await hashSecret(pin) : null

    await withTransaction(app.pool, async (tx) => {
      const update = buildUpdate('employees', { ...data, updated_at: new Date() }, 'id', id)
      if (update) await tx.query(update.text, update.values)
      if (pinHash) {
        await tx.query('UPDATE employees SET pin_hash = $1, pin_enabled = true WHERE id = $2', [pinHash, id])
      } else if (remove_pin) {
        await removePin(tx, id)
      }
    })
    return selectEmployee(app.pool, id)
  })

  app.put('/employees/:id/pin', async (request) => {
    const auth = requireAuth(request)
    const { id } = parseParams(idParams, request)
    const { pin } = parseBody(z.object({ pin: pinSchema }), request)
    assertCanManage(auth, await getTarget(app.pool, id))
    await setPin(app.pool, id, pin)
    return { ok: true }
  })

  app.delete('/employees/:id/pin', async (request) => {
    const auth = requireAuth(request)
    const { id } = parseParams(idParams, request)
    assertCanManage(auth, await getTarget(app.pool, id))
    await removePin(app.pool, id)
    return { ok: true }
  })

  // ---- Administrators (owner only) -----------------------------------------

  app.put('/employees/:id/permissions', async (request) => {
    requireOwner(request)
    const { id } = parseParams(idParams, request)
    const body = parseBody(z.object({ permission: z.enum(PERMISSIONS), value: z.boolean() }), request)
    const target = await getTarget(app.pool, id)
    if (target.role !== 'admin') throw badRequest('Permissions can only be set on administrators', 'not_admin')
    await app.pool.query(
      `UPDATE employees SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), ARRAY[$1::text], to_jsonb($2::boolean)), updated_at = now()
        WHERE id = $3`,
      [body.permission, body.value, id],
    )
    return selectEmployee(app.pool, id)
  })

  // Creates a one-time link for a new administrator. The owner can send it by any channel; if SMTP is
  // configured it is also emailed.
  app.post('/employees/:id/invite', async (request) => {
    requireOwner(request)
    const { id } = parseParams(idParams, request)
    const { email: rawEmail } = parseBody(z.object({ email: emailSchema }), request)
    const email = normalizeEmail(rawEmail)
    const target = await getTarget(app.pool, id)
    if (target.role !== 'admin') throw badRequest('Only administrators can be invited', 'not_admin')
    if (target.user_id) throw conflict('This administrator already has an account', 'has_account')
    if (await one(app.pool, 'SELECT id FROM users WHERE email = $1', [email])) {
      throw conflict('An account with this email already exists', 'email_taken')
    }

    const token = await issueToken(app.pool, { kind: 'invite', email, employeeId: id, hours: 72 })
    await app.pool.query('UPDATE employees SET email = COALESCE(email, $1) WHERE id = $2', [email, id])
    const link = `${baseUrl(request)}/accept-invite?token=${token}`
    const emailed = await sendMail(
      app.config,
      {
        to: email,
        subject: 'You have been invited',
        text: `You were invited to manage attendance. Choose your password here (valid for 72 hours):\n\n${link}`,
      },
      request.log,
    )
    return { link, emailed, email }
  })

  // A new password link for an administrator who lost access (the owner's own password is reset from the server).
  app.post('/employees/:id/reset-link', async (request) => {
    requireOwner(request)
    const { id } = parseParams(idParams, request)
    const target = await one<{ role: string; user_id: string | null; account_email: string | null }>(
      app.pool,
      `SELECT e.role, e.user_id, u.email AS account_email
         FROM employees e LEFT JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
      [id],
    )
    if (!target) throw notFound('Employee not found')
    if (target.role !== 'admin' || !target.user_id || !target.account_email) {
      throw badRequest('Only administrators with an account can have their password reset', 'no_account')
    }
    const token = await issueToken(app.pool, { kind: 'reset', email: target.account_email, userId: target.user_id, hours: 24 })
    return { link: `${baseUrl(request)}/reset-password?token=${token}` }
  })

  // ---- Photo ----------------------------------------------------------------

  app.put('/employees/:id/photo', async (request) => {
    const auth = requireAuth(request)
    const { id } = parseParams(idParams, request)
    assertCanManage(auth, await getTarget(app.pool, id))
    const file = await request.file()
    if (!file) throw badRequest('No file received', 'no_file')
    const buffer = await file.toBuffer()
    savePhoto(app.config, id, buffer)
    const photoUrl = `/api/employees/${id}/photo?v=${Date.now()}`
    await app.pool.query('UPDATE employees SET photo_url = $1, updated_at = now() WHERE id = $2', [photoUrl, id])
    return { photo_url: photoUrl }
  })

  app.delete('/employees/:id/photo', async (request) => {
    const auth = requireAuth(request)
    const { id } = parseParams(idParams, request)
    assertCanManage(auth, await getTarget(app.pool, id))
    deletePhoto(app.config, id)
    await app.pool.query('UPDATE employees SET photo_url = NULL, updated_at = now() WHERE id = $1', [id])
    return { ok: true }
  })

  app.get('/employees/:id/photo', async (request, reply) => {
    requireAuth(request)
    const { id } = parseParams(idParams, request)
    const photo = findPhoto(app.config, id)
    if (!photo) throw notFound('No photo')
    return reply
      .header('Cache-Control', 'private, max-age=300')
      .header('X-Content-Type-Options', 'nosniff')
      .type(photo.mime)
      .send(fs.createReadStream(photo.file))
  })
}
