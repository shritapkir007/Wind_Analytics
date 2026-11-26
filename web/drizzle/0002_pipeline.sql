CREATE TABLE "pipeline_counts" (
	"tracker" text NOT NULL,
	"stage" text NOT NULL,
	"date" date NOT NULL,
	"count" double precision NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"hash" text NOT NULL,
	CONSTRAINT "pipeline_counts_tracker_stage_date_pk" PRIMARY KEY("tracker","stage","date")
);
--> statement-breakpoint
CREATE TABLE "priority_sites" (
	"id" text PRIMARY KEY NOT NULL,
	"site" text NOT NULL,
	"wtgs" double precision,
	"customer" text DEFAULT '' NOT NULL,
	"prescreen" text DEFAULT '' NOT NULL,
	"analysis" text DEFAULT '' NOT NULL,
	"fqc" text DEFAULT '' NOT NULL,
	"requested_by" text DEFAULT '' NOT NULL,
	"sla" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"etd" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pipeline_date_idx" ON "pipeline_counts" USING btree ("date");