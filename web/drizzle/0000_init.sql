CREATE TABLE "alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"date" date NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calendar_days" (
	"employee_key" text NOT NULL,
	"date" date NOT NULL,
	"raw_code" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"leave_type" text,
	"presence" double precision,
	"hash" text NOT NULL,
	CONSTRAINT "calendar_days_employee_key_date_pk" PRIMARY KEY("employee_key","date")
);
--> statement-breakpoint
CREATE TABLE "delivery_daily" (
	"stream" text NOT NULL,
	"date" date NOT NULL,
	"delivered" double precision NOT NULL,
	"expected" double precision NOT NULL,
	"uploaded" double precision NOT NULL,
	"inventory" double precision NOT NULL,
	"quality_issues" double precision NOT NULL,
	"duplicates" double precision NOT NULL,
	"late_uploads" double precision NOT NULL,
	"audit_count" double precision NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "delivery_daily_stream_date_pk" PRIMARY KEY("stream","date")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"key" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"employee_code" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"workflow_id" text PRIMARY KEY NOT NULL,
	"employee_key" text NOT NULL,
	"request_kind" text DEFAULT '' NOT NULL,
	"leave_type" text DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"comment" text DEFAULT '' NOT NULL,
	"applied_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"approval_status" text DEFAULT '' NOT NULL,
	"reviewed_by" text DEFAULT '' NOT NULL,
	"lead_comment" text DEFAULT '' NOT NULL,
	"calendar_status" text DEFAULT '' NOT NULL,
	"calendar_comment" text DEFAULT '' NOT NULL,
	"zoho_applied" text DEFAULT '' NOT NULL,
	"manager_note" text DEFAULT '' NOT NULL,
	"slack_url" text DEFAULT '' NOT NULL,
	"effective" boolean NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "output_submissions" (
	"employee_key" text NOT NULL,
	"date" date NOT NULL,
	"submitted_at" timestamp with time zone,
	"added_by" text,
	"entry_status" text DEFAULT '' NOT NULL,
	"other_work" text,
	"lead_note" text,
	"source_row" integer NOT NULL,
	"entries" jsonb NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "output_submissions_employee_key_date_pk" PRIMARY KEY("employee_key","date")
);
--> statement-breakpoint
CREATE TABLE "overtime_entries" (
	"row_key" text PRIMARY KEY NOT NULL,
	"employee_key" text,
	"analyst_name" text NOT NULL,
	"date" date NOT NULL,
	"process" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"time_start" text DEFAULT '' NOT NULL,
	"time_end" text DEFAULT '' NOT NULL,
	"shift" text DEFAULT '' NOT NULL,
	"shift_weight" double precision NOT NULL,
	"turbines_text" text DEFAULT '' NOT NULL,
	"turbines_parsed" double precision,
	"supervisor" text DEFAULT '' NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_values" (
	"key" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"source" text NOT NULL,
	"tab" text NOT NULL,
	"row_ref" text NOT NULL,
	"severity" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"trigger" text NOT NULL,
	"triggered_by" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"key" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"process" text NOT NULL,
	"images" text DEFAULT '' NOT NULL,
	"range" text DEFAULT '' NOT NULL,
	"per_day" double precision,
	"minutes_per_wtg" double precision,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"actor" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"process" text,
	"assignee_key" text,
	"assigned_by" text NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"assigned_on" date NOT NULL,
	"due_on" date,
	"completed_on" date,
	"status" text DEFAULT 'Not Started' NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"depends_on" integer[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"last_login" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "calendar_date_idx" ON "calendar_days" USING btree ("date");--> statement-breakpoint
CREATE INDEX "output_date_idx" ON "output_submissions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sync_issues_run_idx" ON "sync_issues" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_key");