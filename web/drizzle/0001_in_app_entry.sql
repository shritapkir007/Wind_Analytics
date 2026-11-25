CREATE TABLE "attendance_overrides" (
	"employee_key" text NOT NULL,
	"date" date NOT NULL,
	"code" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attendance_overrides_employee_key_date_pk" PRIMARY KEY("employee_key","date")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "delivery_daily" ADD COLUMN "delivered_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_daily" ADD COLUMN "entered_by" text;--> statement-breakpoint
ALTER TABLE "delivery_daily" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "week_off" integer[] DEFAULT '{0,6}' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "work_location" text DEFAULT 'office' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "joined_on" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "left_on" date;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "half_day" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "output_submissions" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "output_submissions" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "overtime_entries" ADD COLUMN "status" text DEFAULT 'Approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "overtime_entries" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "overtime_entries" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "overtime_entries" ADD COLUMN "review_comment" text;--> statement-breakpoint
ALTER TABLE "overtime_entries" ADD COLUMN "created_by" text;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity","entity_id");