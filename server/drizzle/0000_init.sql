CREATE TABLE "absence_justifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"date_to" date,
	"type" text DEFAULT 'otro' NOT NULL,
	"reason" text DEFAULT '',
	"document_url" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absence_justifications_employee_date_key" UNIQUE("employee_id","date"),
	CONSTRAINT "absence_justifications_status_check" CHECK ("absence_justifications"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "absence_justifications_type_check" CHECK ("absence_justifications"."type" IN ('permiso_con_goce', 'permiso_sin_goce', 'vacaciones', 'descanso_medico', 'licencia', 'suspension', 'comision_servicio', 'otro'))
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid,
	"type" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"location_lat" double precision,
	"location_lng" double precision,
	"location_valid" boolean,
	"device_info" text,
	"is_manual" boolean DEFAULT false NOT NULL,
	"manual_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_type_check" CHECK ("attendance_records"."type" IN ('checkin', 'break_start', 'break_end', 'checkout', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"employee_id" uuid,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_tokens_kind_check" CHECK ("auth_tokens"."kind" IN ('invite', 'reset'))
);
--> statement-breakpoint
CREATE TABLE "business" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"tolerance_minutes" integer DEFAULT 5 NOT NULL,
	"geo_enabled" boolean DEFAULT false NOT NULL,
	"geo_radius_meters" integer DEFAULT 100 NOT NULL,
	"location_lat" double precision,
	"location_lng" double precision,
	"location_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_tolerance_check" CHECK ("business"."tolerance_minutes" >= 0),
	CONSTRAINT "business_radius_check" CHECK ("business"."geo_radius_meters" > 0)
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"last_name" text NOT NULL,
	"doc_type" text DEFAULT 'ID' NOT NULL,
	"dni" text,
	"email" text,
	"phone" text,
	"puesto" text,
	"birth_date" date,
	"sex" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pin_hash" text,
	"pin_enabled" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"vacation_days_per_year" integer DEFAULT 30 NOT NULL,
	"photo_url" text,
	"department_id" uuid,
	"location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_role_check" CHECK ("employees"."role" IN ('owner', 'admin', 'employee')),
	CONSTRAINT "employees_sex_check" CHECK ("employees"."sex" IN ('M', 'F', 'X'))
);
--> statement-breakpoint
CREATE TABLE "geo_blocked_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid,
	"attempted_lat" double precision NOT NULL,
	"attempted_lng" double precision NOT NULL,
	"distance_meters" double precision NOT NULL,
	"accuracy_reported" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"geo_radius_meters" integer DEFAULT 100 NOT NULL,
	"geo_enabled" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"minutes_authorized" integer DEFAULT 0 NOT NULL,
	"authorized_by" uuid,
	"consent" boolean DEFAULT false NOT NULL,
	"compensation" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overtime_authorizations_employee_date_key" UNIQUE("employee_id","date"),
	CONSTRAINT "overtime_minutes_check" CHECK ("overtime_authorizations"."minutes_authorized" >= 0),
	CONSTRAINT "overtime_compensation_check" CHECK ("overtime_authorizations"."compensation" IN ('pago', 'descanso'))
);
--> statement-breakpoint
CREATE TABLE "pin_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"format" text NOT NULL,
	"report_kind" text DEFAULT 'attendance' NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"employee_count" integer,
	"size_bytes" bigint,
	"created_by" uuid,
	"created_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_format_check" CHECK ("reports"."format" IN ('xlsx', 'pdf'))
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid,
	"location_id" uuid,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"break_start" time,
	"break_end" time,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_exceptions_scope_check" CHECK ("schedule_exceptions"."employee_id" IS NULL OR "schedule_exceptions"."location_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid,
	"location_id" uuid,
	"name" text DEFAULT 'Main schedule' NOT NULL,
	"days_of_week" integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_start" time,
	"break_end" time,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_scope_check" CHECK ("schedules"."employee_id" IS NULL OR "schedules"."location_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vacation_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"days" integer NOT NULL,
	"reason" text DEFAULT '',
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_justifications" ADD CONSTRAINT "absence_justifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_blocked_attempts" ADD CONSTRAINT "geo_blocked_attempts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_blocked_attempts" ADD CONSTRAINT "geo_blocked_attempts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_authorizations" ADD CONSTRAINT "overtime_authorizations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_authorizations" ADD CONSTRAINT "overtime_authorizations_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pin_attempts" ADD CONSTRAINT "pin_attempts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_adjustments" ADD CONSTRAINT "vacation_adjustments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_adjustments" ADD CONSTRAINT "vacation_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_employee_time_idx" ON "attendance_records" USING btree ("employee_id","timestamp");--> statement-breakpoint
CREATE INDEX "attendance_time_idx" ON "attendance_records" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "business_singleton" ON "business" USING btree ((true));--> statement-breakpoint
CREATE UNIQUE INDEX "employees_single_owner" ON "employees" USING btree ("role") WHERE "employees"."role" = 'owner';--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_unique" ON "employees" USING btree ("user_id") WHERE "employees"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "employees_active_idx" ON "employees" USING btree ("active","role");--> statement-breakpoint
CREATE INDEX "geo_blocked_created_idx" ON "geo_blocked_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pin_attempts_employee_idx" ON "pin_attempts" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_exceptions_unique" ON "schedule_exceptions" USING btree ("date",COALESCE("employee_id", '00000000-0000-0000-0000-000000000000'::uuid),COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "schedules_employee_idx" ON "schedules" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "schedules_location_idx" ON "schedules" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");