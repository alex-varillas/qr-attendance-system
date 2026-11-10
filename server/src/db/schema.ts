import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const id = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// ---------------------------------------------------------------------------
// Accounts and sessions. Only the owner and the administrators have accounts;
// regular employees check in with the QR code and an optional PIN.
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
})

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 of the random token stored in the cookie; the token itself is never stored.
    id: text('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

// One-time links: an invitation for a new administrator, or a password reset.
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: id(),
    kind: text('kind').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    email: text('email').notNull(),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('auth_tokens_kind_check', sql`${t.kind} IN ('invite', 'reset')`)],
)

// ---------------------------------------------------------------------------
// The business. There is exactly one row (enforced by the singleton index).
// ---------------------------------------------------------------------------

export const business = pgTable(
  'business',
  {
    id: id(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('en'),
    toleranceMinutes: integer('tolerance_minutes').notNull().default(5),
    geoEnabled: boolean('geo_enabled').notNull().default(false),
    geoRadiusMeters: integer('geo_radius_meters').notNull().default(100),
    locationLat: doublePrecision('location_lat'),
    locationLng: doublePrecision('location_lng'),
    locationAddress: text('location_address'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('business_singleton').on(sql`(true)`),
    check('business_tolerance_check', sql`${t.toleranceMinutes} >= 0`),
    check('business_radius_check', sql`${t.geoRadiusMeters} > 0`),
  ],
)

export const locations = pgTable('locations', {
  id: id(),
  name: text('name').notNull(),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  geoRadiusMeters: integer('geo_radius_meters').notNull().default(100),
  geoEnabled: boolean('geo_enabled').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const departments = pgTable('departments', {
  id: id(),
  name: text('name').notNull().unique(),
  createdAt: createdAt(),
})

export const employees = pgTable(
  'employees',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    lastName: text('last_name').notNull(),
    docType: text('doc_type').notNull().default('ID'),
    dni: text('dni'),
    email: text('email'),
    phone: text('phone'),
    puesto: text('puesto'),
    birthDate: date('birth_date'),
    sex: text('sex'),
    role: text('role').notNull().default('employee'),
    permissions: jsonb('permissions').notNull().default(sql`'{}'::jsonb`),
    pinHash: text('pin_hash'),
    pinEnabled: boolean('pin_enabled').notNull().default(false),
    active: boolean('active').notNull().default(true),
    vacationDaysPerYear: integer('vacation_days_per_year').notNull().default(30),
    photoUrl: text('photo_url'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('employees_role_check', sql`${t.role} IN ('owner', 'admin', 'employee')`),
    check('employees_sex_check', sql`${t.sex} IN ('M', 'F', 'X')`),
    // At most one owner, and one employee row per account.
    uniqueIndex('employees_single_owner').on(t.role).where(sql`${t.role} = 'owner'`),
    uniqueIndex('employees_user_unique').on(t.userId).where(sql`${t.userId} IS NOT NULL`),
    index('employees_active_idx').on(t.active, t.role),
  ],
)

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export const schedules = pgTable(
  'schedules',
  {
    id: id(),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Main schedule'),
    daysOfWeek: integer('days_of_week').array().notNull().default(sql`'{1,2,3,4,5}'::integer[]`),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    breakStart: time('break_start'),
    breakEnd: time('break_end'),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('schedules_employee_idx').on(t.employeeId),
    index('schedules_location_idx').on(t.locationId),
    check('schedules_scope_check', sql`${t.employeeId} IS NULL OR ${t.locationId} IS NULL`),
  ],
)

export const scheduleExceptions = pgTable(
  'schedule_exceptions',
  {
    id: id(),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    breakStart: time('break_start'),
    breakEnd: time('break_end'),
    reason: text('reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('schedule_exceptions_scope_check', sql`${t.employeeId} IS NULL OR ${t.locationId} IS NULL`),
    uniqueIndex('schedule_exceptions_unique').on(
      t.date,
      sql`COALESCE(${t.employeeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`COALESCE(${t.locationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
)

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: id(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    locationLat: doublePrecision('location_lat'),
    locationLng: doublePrecision('location_lng'),
    locationValid: boolean('location_valid'),
    deviceInfo: text('device_info'),
    isManual: boolean('is_manual').notNull().default(false),
    manualReason: text('manual_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'attendance_records_type_check',
      sql`${t.type} IN ('checkin', 'break_start', 'break_end', 'checkout', 'manual')`,
    ),
    index('attendance_employee_time_idx').on(t.employeeId, t.timestamp),
    index('attendance_time_idx').on(t.timestamp),
  ],
)

export const attendanceAudit = pgTable('attendance_audit', {
  id: id(),
  // Not a foreign key: the audit trail must outlive the record it describes.
  attendanceRecordId: uuid('attendance_record_id'),
  action: text('action').notNull(),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  reason: text('reason'),
})

export const geoBlockedAttempts = pgTable(
  'geo_blocked_attempts',
  {
    id: id(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    attemptedLat: doublePrecision('attempted_lat').notNull(),
    attemptedLng: doublePrecision('attempted_lng').notNull(),
    distanceMeters: doublePrecision('distance_meters').notNull(),
    accuracyReported: doublePrecision('accuracy_reported'),
    createdAt: createdAt(),
  },
  (t) => [index('geo_blocked_created_idx').on(t.createdAt)],
)

export const pinAttempts = pgTable(
  'pin_attempts',
  {
    id: id(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    success: boolean('success').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('pin_attempts_employee_idx').on(t.employeeId, t.createdAt)],
)

// ---------------------------------------------------------------------------
// Leave, overtime and holidays
// ---------------------------------------------------------------------------

export const absenceJustifications = pgTable(
  'absence_justifications',
  {
    id: id(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    dateTo: date('date_to'),
    type: text('type').notNull().default('otro'),
    reason: text('reason').default(''),
    documentUrl: text('document_url'),
    status: text('status').notNull().default('approved'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('absence_justifications_employee_date_key').on(t.employeeId, t.date),
    check('absence_justifications_status_check', sql`${t.status} IN ('pending', 'approved', 'rejected')`),
    check(
      'absence_justifications_type_check',
      sql`${t.type} IN ('permiso_con_goce', 'permiso_sin_goce', 'vacaciones', 'descanso_medico', 'licencia', 'suspension', 'comision_servicio', 'otro')`,
    ),
  ],
)

export const vacationAdjustments = pgTable('vacation_adjustments', {
  id: id(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  days: integer('days').notNull(),
  reason: text('reason').default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
})

export const overtimeAuthorizations = pgTable(
  'overtime_authorizations',
  {
    id: id(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    minutesAuthorized: integer('minutes_authorized').notNull().default(0),
    authorizedBy: uuid('authorized_by').references(() => users.id, { onDelete: 'set null' }),
    consent: boolean('consent').notNull().default(false),
    compensation: text('compensation'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('overtime_authorizations_employee_date_key').on(t.employeeId, t.date),
    check('overtime_minutes_check', sql`${t.minutesAuthorized} >= 0`),
    check('overtime_compensation_check', sql`${t.compensation} IN ('pago', 'descanso')`),
  ],
)

export const holidays = pgTable('holidays', {
  id: id(),
  date: date('date').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
})

// ---------------------------------------------------------------------------
// Saved reports (files live on disk under DATA_DIR)
// ---------------------------------------------------------------------------

export const reports = pgTable(
  'reports',
  {
    id: id(),
    fileName: text('file_name').notNull(),
    storagePath: text('storage_path').notNull(),
    format: text('format').notNull(),
    reportKind: text('report_kind').notNull().default('attendance'),
    dateFrom: date('date_from').notNull(),
    dateTo: date('date_to').notNull(),
    employeeCount: integer('employee_count'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdByEmail: text('created_by_email'),
    createdAt: createdAt(),
  },
  (t) => [check('reports_format_check', sql`${t.format} IN ('xlsx', 'pdf')`)],
)
