import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const d = (name: string) => date(name, { mode: "string" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

// ---------- Synced from Google Sheets (read-only mirrors; every row carries a content hash) ----------

export const employees = pgTable("employees", {
  key: text("key").primaryKey(),
  email: text("email"),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  section: text("section").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  employeeCode: text("employee_code"),
  // In-app roster (data mode "app"): weekly days off (0 = Sunday … 6 = Saturday), default place of work.
  weekOff: integer("week_off").array().notNull().default([0, 6]),
  workLocation: text("work_location").notNull().default("office"), // office | wfh
  joinedOn: d("joined_on"),
  leftOn: d("left_on"),
  hash: text("hash").notNull(),
});

export const outputSubmissions = pgTable(
  "output_submissions",
  {
    employeeKey: text("employee_key").notNull(),
    date: d("date").notNull(),
    submittedAt: ts("submitted_at"),
    addedBy: text("added_by"),
    entryStatus: text("entry_status").notNull().default(""),
    otherWork: text("other_work"),
    leadNote: text("lead_note"),
    sourceRow: integer("source_row").notNull(),
    entries: jsonb("entries").$type<Record<string, number>>().notNull(),
    updatedAt: ts("updated_at"),
    updatedBy: text("updated_by"),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.employeeKey, t.date] }), index("output_date_idx").on(t.date)],
);

export const calendarDays = pgTable(
  "calendar_days",
  {
    employeeKey: text("employee_key").notNull(),
    date: d("date").notNull(),
    rawCode: text("raw_code").notNull().default(""),
    category: text("category").notNull(),
    leaveType: text("leave_type"),
    presence: doublePrecision("presence"),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.employeeKey, t.date] }), index("calendar_date_idx").on(t.date)],
);

export const leaveRequests = pgTable("leave_requests", {
  workflowId: text("workflow_id").primaryKey(),
  employeeKey: text("employee_key").notNull(),
  requestKind: text("request_kind").notNull().default(""),
  leaveType: text("leave_type").notNull().default(""),
  startDate: d("start_date"),
  endDate: d("end_date"),
  comment: text("comment").notNull().default(""),
  appliedAt: ts("applied_at"),
  closedAt: ts("closed_at"),
  approvalStatus: text("approval_status").notNull().default(""),
  reviewedBy: text("reviewed_by").notNull().default(""),
  leadComment: text("lead_comment").notNull().default(""),
  calendarStatus: text("calendar_status").notNull().default(""),
  calendarComment: text("calendar_comment").notNull().default(""),
  zohoApplied: text("zoho_applied").notNull().default(""),
  managerNote: text("manager_note").notNull().default(""),
  slackUrl: text("slack_url").notNull().default(""),
  effective: boolean("effective").notNull(),
  halfDay: text("half_day"), // first | second (in-app requests)
  createdBy: text("created_by"),
  hash: text("hash").notNull(),
});

export const deliveryDaily = pgTable(
  "delivery_daily",
  {
    stream: text("stream").notNull(),
    date: d("date").notNull(),
    delivered: doublePrecision("delivered").notNull(),
    expected: doublePrecision("expected").notNull(),
    uploaded: doublePrecision("uploaded").notNull(),
    inventory: doublePrecision("inventory").notNull(),
    qualityIssues: doublePrecision("quality_issues").notNull(),
    duplicates: doublePrecision("duplicates").notNull(),
    lateUploads: doublePrecision("late_uploads").notNull(),
    auditCount: doublePrecision("audit_count").notNull(),
    deliveredManual: boolean("delivered_manual").notNull().default(false),
    enteredBy: text("entered_by"),
    updatedAt: ts("updated_at"),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.stream, t.date] })],
);

export const targets = pgTable("targets", {
  key: text("key").primaryKey(),
  method: text("method").notNull(),
  process: text("process").notNull(),
  images: text("images").notNull().default(""),
  range: text("range").notNull().default(""),
  perDay: doublePrecision("per_day"),
  minutesPerWtg: doublePrecision("minutes_per_wtg"),
  hash: text("hash").notNull(),
});

export const overtimeEntries = pgTable("overtime_entries", {
  rowKey: text("row_key").primaryKey(),
  employeeKey: text("employee_key"),
  analystName: text("analyst_name").notNull(),
  date: d("date").notNull(),
  process: text("process").notNull().default(""),
  department: text("department").notNull().default(""),
  location: text("location").notNull().default(""),
  timeStart: text("time_start").notNull().default(""),
  timeEnd: text("time_end").notNull().default(""),
  shift: text("shift").notNull().default(""),
  shiftWeight: doublePrecision("shift_weight").notNull(),
  turbinesText: text("turbines_text").notNull().default(""),
  turbinesParsed: doublePrecision("turbines_parsed"),
  supervisor: text("supervisor").notNull().default(""),
  status: text("status").notNull().default("Approved"), // Pending | Approved | Declined (sheet rows are approved)
  reviewedBy: text("reviewed_by"),
  reviewedAt: ts("reviewed_at"),
  reviewComment: text("review_comment"),
  createdBy: text("created_by"),
  hash: text("hash").notNull(),
});

/** Values read from the sheets only to cross-check our numbers (dashboard cards, headcount row). */
export const referenceValues = pgTable("reference_values", {
  key: text("key").primaryKey(),
  value: doublePrecision("value").notNull(),
  hash: text("hash").notNull(),
});

// ---------- Sync bookkeeping ----------

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull(), // quick | full
  trigger: text("trigger").notNull(), // schedule | manual | startup
  triggeredBy: text("triggered_by"),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  status: text("status").notNull(), // running | success | partial | failed
  stats: jsonb("stats").$type<Record<string, { read: number; inserted: number; updated: number; deleted: number; error?: string }>>(),
  error: text("error"),
});

export const syncIssues = pgTable(
  "sync_issues",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull(),
    source: text("source").notNull(),
    tab: text("tab").notNull(),
    rowRef: text("row_ref").notNull(),
    severity: text("severity").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
  },
  (t) => [index("sync_issues_run_idx").on(t.runId)],
);

// ---------- App-owned data ----------

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    project: text("project").notNull().default(""),
    process: text("process"),
    assigneeKey: text("assignee_key"),
    assignedBy: text("assigned_by").notNull(),
    priority: text("priority").notNull().default("Medium"), // Low | Medium | High | Critical
    assignedOn: d("assigned_on").notNull(),
    dueOn: d("due_on"),
    completedOn: d("completed_on"),
    status: text("status").notNull().default("Not Started"),
    remarks: text("remarks").notNull().default(""),
    dependsOn: integer("depends_on").array().notNull().default([]),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assigneeKey)],
);

export const taskEvents = pgTable("task_events", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  actor: text("actor").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  at: ts("at").notNull(),
});

export const alerts = pgTable("alerts", {
  key: text("key").primaryKey(), // kind|subject|date  (stable, so re-raising is idempotent)
  kind: text("kind").notNull(),
  severity: text("severity").notNull(), // critical | warning | info
  subjectType: text("subject_type").notNull(), // employee | stream | task | sync | data
  subjectId: text("subject_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  date: d("date").notNull(),
  firstSeen: ts("first_seen").notNull(),
  lastSeen: ts("last_seen").notNull(),
  resolvedAt: ts("resolved_at"),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: ts("acknowledged_at"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull(),
});

export const users = pgTable("users", {
  email: text("email").primaryKey(),
  name: text("name"),
  role: text("role").notNull().default("viewer"), // admin | manager | lead | viewer
  lastLogin: ts("last_login"),
});

// ---------- In-app data entry (data mode "app") ----------

export const holidays = pgTable("holidays", {
  date: d("date").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by"),
});

/** Per-person, per-day attendance set by a lead (LoP, Training, Present, WFH, …); wins over generated days. */
export const attendanceOverrides = pgTable(
  "attendance_overrides",
  {
    employeeKey: text("employee_key").notNull(),
    date: d("date").notNull(),
    code: text("code").notNull(),
    note: text("note").notNull().default(""),
    setBy: text("set_by").notNull(),
    setAt: ts("set_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.employeeKey, t.date] })],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    at: ts("at").notNull(),
    actor: text("actor").notNull(),
    entity: text("entity").notNull(), // output | leave | overtime | inventory | attendance | employee | holiday | target | mode
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    detail: jsonb("detail"),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);

// ---------- Wind inventory pipeline (Wind-Inventory Count sheet, or entered in the app) ----------

/** WTGs (or QIs / items) in each stage of each tracker, as counted on a day. */
export const pipelineCounts = pgTable(
  "pipeline_counts",
  {
    tracker: text("tracker").notNull(),
    stage: text("stage").notNull(),
    date: d("date").notNull(),
    count: doublePrecision("count").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: ts("updated_at"),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tracker, t.stage, t.date] }), index("pipeline_date_idx").on(t.date)],
);

/** Customer sites the Ops coordinators asked to prioritise ("Priority" tab). */
export const prioritySites = pgTable("priority_sites", {
  id: text("id").primaryKey(),
  site: text("site").notNull(),
  wtgs: doublePrecision("wtgs"),
  customer: text("customer").notNull().default(""),
  prescreen: text("prescreen").notNull().default(""),
  analysis: text("analysis").notNull().default(""),
  fqc: text("fqc").notNull().default(""),
  requestedBy: text("requested_by").notNull().default(""),
  sla: text("sla").notNull().default(""),
  status: text("status").notNull().default(""),
  comments: text("comments").notNull().default(""),
  etd: d("etd"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at"),
  hash: text("hash").notNull(),
});
