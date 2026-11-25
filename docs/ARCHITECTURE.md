# Wind Ops — Phase 2: System Architecture

Status: **approved 23 Nov 2026** · Source analysis date: 23 Nov 2026

This document is the reference for the data model, the mapping from each sheet,
the synchronisation logic and every KPI formula. The implementation lives in `web/`.

---

## 1. Decisions recorded

| # | Decision |
|---|---|
| D1 | Only the three Google Sheets are sources. **No Asana.** |
| D2 | Attendance follows the sheets exactly; output is attributed to the days and processes actually worked. |
| D3 | Productivity = Σ(actual ÷ process daily target) per present day (formula in §6). |
| D4 | Fractional outputs (0.33, 1.33…) are partial turbines (e.g. 1 of 3 blades) and are kept as decimals. |
| D5 | `User Input` is unique per (employee email, Output_Date); the form enforces it. A repeat is a **data error** (flagged, never summed). |
| D6 | Leave workbook: only `Tracker`, `Dashboard`, `Calendar View`, `Leave Tracker` are read. |
| D7 | Deliveries are count-level (from `Active ZV` + per-person output). Tasks are created and stored **in the app**. |
| D8 | The official roster is `Calendar View`. Others appear in an "unmatched people" data-quality list. |
| D9 | Hosting: Next.js on Vercel + Postgres (Supabase); read-only Google service account. |
| D10 | Login: Google sign-in restricted to `@zeitview.com`. |

---

## 2. Source → module mapping

### 2.1 Work Study Wind WTGs/Day – 2026 (`1cw3ymBS…`)

| Tab | Read? | Key | Maps to |
|---|---|---|---|
| `User Input` | **Yes — primary** | (email in col A, `Output_Date`) | `output_submissions`, `output_entries` |
| `Active ZV` | **Yes** | (stream, Date) | `delivery_daily` |
| `Target` | **Yes** | (Method, Process) | `processes.target_per_day`, `minutes_per_wtg` |
| `Employee List` | Yes (roster cross-check only) | email | `employees` reconciliation |
| ~30 process pivot tabs (`Ext_FQC`, `Audit-2026`, …) | **Validation only** | — | nightly reconciliation test: our per-person/day totals must equal these pivots |
| `Daily Output`, `Summary`, `[Chart1]…` | No | — | derived / broken (`#N/A`) |

`User Input` columns:

| Col | Header | Use |
|---|---|---|
| A | `Emplyoee Name` (actually an email) | employee key |
| B | `Output_Date` (D/M/YYYY, padding varies) | **the work date** — always used for reporting |
| C | `Data Added By` | audit (who entered it; flag when ≠ A) |
| D | `Timestamp` (DD/MM/YYYY HH:MM:SS, IST) | submission time; "late entry" = Timestamp date > Output_Date + 1 |
| E | `Which Backend Sheets Updated ?` | ignored (derivable) |
| F | `Output Entry Status` | every row counts (the pivot tabs count them all); any value other than `Updated` is listed as a data-quality note |
| G–AI | 29 numeric process columns | `output_entries` (long format, qty > 0 only) |
| AJ | `Other_Work` | free text → `output_submissions.other_work_note` (not summed) |
| AK | `Team Lead's Notes` | free text → note |

### 2.2 Wind Leave Request Tracker – 2026 (`1Rc9nVVE…`)

| Tab | Read? | Maps to |
|---|---|---|
| `Calendar View` | **Yes — attendance truth** | `employees` (roster + section), `calendar_days` |
| `Leave Tracker` | **Yes — request log** | `leave_requests` |
| `Tracker` | Yes — reconciliation | every `Leave Tracker` Workflow ID must exist in `Tracker` and vice versa |
| `Dashboard` | Yes — validation | our totals must match its cards (Total / Approved / Declined / Pending …) |

`Calendar View` layout: row 1 = dates (`Jan 1`…, with month-label columns in between that must be skipped),
row 2 = weekday, row 3 = headcount formula, row 4 = `93 − headcount`, rows 5+ = people.
Column A name, B email, C role. Section header rows (single cell in A) define groups:
*(main)*, `WFH`, `Properties-Wind-Utilities Cross Vertical`, `Data Process`, `LM Blade Pilot`,
`GWO`, `Resigned/Layed OFF People`, `Department Changed`, `Encord Project`.

Cell codes seen: *(blank)*, `Working`, `WFH`, `Week Off`, `Public Holiday`, `EL`, `CL`, `WL`, `PL`,
`EL CF`, `Comp Off`, `First Half X` / `Second Half X` (X ∈ CL, EL, EL CF, WL). LoP is added manually.

`Leave Tracker` columns used: Workflow ID (key), Request from (email), Request (Planned / Unplanned /
Compensatory Off), Request Type (EL/CL/WL/PL/EL CF/Comp Off), Start/End Date (DD/MM/YYYY),
Application Time Stamp & Closures Time Stamp (prose → parsed), Approval Status, Reviewed by,
Leads Comment, Status With Calendar View (`Processed` / `Revert Leave` / `Not Processed`),
Comment from Calendar View, Zoho Applied ?, Manager's Note.

### 2.3 Wind Team – OT tracker 2025-2026 (`1x0qPTBH…`)

| Tab | Read? | Maps to |
|---|---|---|
| `Wind OT tracker 2026` | **Yes** | `overtime_entries` |
| `Employee ID` | **Yes** | `employees.employee_code` (FW###) |
| `Wind OT tracker 2025`, `Total OT Days`, dashboard tab | No | historical / derived |

---

## 3. Data-quality rules (applied on every sync)

| Rule | Handling | Surfaced as |
|---|---|---|
| Dates are **day-first** everywhere except the leave `Dashboard` A1 (M/D) | strict `d/M/yyyy` parser; ambiguous or invalid → row rejected | `sync_issues` (severity: error) |
| Slack prose timestamps ("December 31st, 2025 at 11:39 AM GMT+5:30") | dedicated parser | issue if unparsable |
| Employee identity | key = lower-cased, trimmed email with zero-width chars removed; `+suffix` stripped (`name+old@` → `name@`) | — |
| Name spelling variants across tabs | display name comes from `Calendar View` only | — |
| Output for an email not in `Calendar View` | kept, attributed to an "unmatched" employee | Data Quality → Unmatched people |
| Repeat (email, Output_Date) in `User Input` | **first row kept, others quarantined** (never summed) | issue (error) |
| Output logged on a non-present day (leave / week off / holiday) | kept, counted | issue (warning) "output on leave/off day" |
| Present working day with no `User Input` row | not "absent" | "No output logged" list (warning) |
| Non-numeric value in a numeric process column | treated as 0 | issue (warning) with the raw value |
| `Approval Status = Approved` but calendar status `Revert Leave` / "Leave Reverted" | **not** counted as leave | — |
| Leave request with no matching calendar code (or vice versa) | — | issue (warning) "request/calendar mismatch" |
| Resigned person still has an email in Calendar View | treated as inactive | issue (info) |
| Row 4 of Calendar View hard-codes 93 people | ignored; we compute from the roster | issue (info) |
| Calendar headcount formula gives half-day **WL** 0 | app uses 0.5 (decision 23 Nov); the headcount reconciliation excludes this difference | issue (info) |

---

## 4. Database schema (Postgres)

```
employees            id, email (unique), name, role, section, is_active, employee_code (FW###),
                     first_seen, last_seen
employee_aliases     alias (unique, normalised), employee_id         -- names/emails seen in other tabs
processes            id, source_column (unique), label, family (External|Internal|ZDT|Data Process|
                     Turbine|Audit|Upload|Other), target_per_day (nullable), minutes_per_wtg (nullable),
                     counts_as_delivery (bool)
output_submissions   id, employee_id, output_date, submitted_at, added_by, entry_status,
                     other_work_note, lead_note, source_row, row_hash   UNIQUE(employee_id, output_date)
output_entries       submission_id, process_id, qty numeric(10,2)       PK(submission_id, process_id)
calendar_days        employee_id, date, raw_code, category (present|wfh|leave|half_leave|week_off|
                     holiday|lop|unknown), leave_type, presence_weight numeric(2,1)   PK(employee_id, date)
leave_requests       workflow_id PK, employee_id, request_kind (planned|unplanned|comp_off),
                     leave_type, start_date, end_date, days, comment, applied_at, closed_at,
                     approval_status, reviewed_by, lead_comment, calendar_status, calendar_comment,
                     zoho_applied, manager_note, row_hash
delivery_daily       stream (External|Internal|ZDT), date, delivered, expected, uploaded,
                     inventory, quality_issues, duplicates, late_uploads, audit_count  PK(stream, date)
overtime_entries     id, employee_id, date, process, department, time_start, time_end, shift_weight,
                     turbines_text, turbines_parsed (nullable), supervisor, row_hash
tasks                id, code (TSK-0001), title, description, project, process_id, assignee_id,
                     assigned_by, priority, assigned_on, due_on, completed_on, status, remarks,
                     created_at, updated_at
task_dependencies    task_id, depends_on_task_id
task_events          id, task_id, actor, field, old_value, new_value, at          -- audit trail
alert_rules          id, kind, threshold jsonb, enabled, channels text[]
alerts               id, rule_id, kind, severity, subject_type, subject_id, message, date,
                     first_seen, last_seen, resolved_at, acknowledged_by
sync_runs            id, source, tab, started_at, finished_at, status, rows_read, inserted,
                     updated, deleted, error
sync_issues          id, run_id, source, tab, row_ref, severity, code, message, raw jsonb, resolved
users                email PK, role (admin|manager|lead|viewer), employee_id (nullable), last_login
settings             key PK, value jsonb                                    -- thresholds, schedule
```

Every KPI is a SQL view over these tables, so each number can be traced to rows
(`output_entries → output_submissions.source_row`, `calendar_days`, `leave_requests.workflow_id`).

---

## 5. Synchronisation

* **Auth**: a Google Cloud service account with Sheets API read-only scope
  (`spreadsheets.readonly`). The three sheets are shared with it as *Viewer*. Its key lives only
  in server environment variables.
* **Schedule**: every 15 min, 06:30–23:15 IST, plus a full sync at 02:00 IST, by the GitHub Actions
  workflow `.github/workflows/wind-ops-sync.yml` calling the protected route `/api/sync`
  (any scheduler that can send `Authorization: Bearer <CRON_SECRET>` works).
* **Manual refresh**: "Sync now" button (admin/manager) → same route.
* **Per tab**: `spreadsheets.values.batchGet` (FORMATTED_VALUE) → parse → validate (zod) →
  compute `row_hash` per business key → upsert changed rows, mark vanished keys deleted →
  write `sync_runs` + `sync_issues`. Runs in one transaction per tab, so a failing tab never
  leaves partial data and the last good data stays visible.
* **Change detection**: inserts/updates since the previous run are shown as "new/updated records".
* **Failure**: run marked `failed`, a "Data sync failed" alert is raised, and the header shows
  *Last successful sync* with a warning badge.
* **Read-only**: nothing is written back to the sheets (tasks live in the app database).

---

## 6. KPI definitions

Notation: *d* = a date, *e* = employee, *p* = process. All periods are in IST.
"Active employee" = in `Calendar View`, has an email, and is not under *Resigned/Layed OFF* or
*Department Changed*.

### 6.1 Attendance (mirrors the sheet's own headcount formula)

| Code | presence_weight | category |
|---|---|---|
| blank, `Working` | 1 | present |
| `WFH` | 1 | present (WFH) |
| `First/Second Half` CL, EL, EL CF, WL | 0.5 | half leave (half-day WL = 0.5 by decision 23 Nov; the sheet's own formula gives it 0, and the reconciliation check allows for that) |
| EL, CL, WL, PL, EL CF, Comp Off | 0 | leave |
| LoP | 0 | absent (unpaid) |
| `GWO Training` (any code with "Training") | 1 for attendance, **0 for productivity** | training (decision 25 Nov) |
| `Bereavement`, `Leave` | 0 | leave, shown as their own leave types (decision 25 Nov) |
| Typos `Fisrt/Frist Half …`, `Secound Half …` | as the intended half-day code | half leave |
| `Week Off` | — | not a working day |
| `Public Holiday` | — | not a working day |

* **Approved "Working" requests** (Leave Tracker type `Working`: working a day, e.g. a weekend, to
  earn comp off) are **not leave**. If Calendar View shows Week Off / Public Holiday for that date,
  the day counts as a present working day (decision 25 Nov).
* **Present today** = Σ presence_weight over active employees for today.
* **On leave today** = count of active employees with a leave or half-leave code today.
* **Absent today** = count with **LoP** in Calendar View. Unplanned leave (an approved
  *Time Off – Unplanned* request) is **leave**, counted in *On leave* and tagged "Unplanned"
  (decision 25 Nov).
  Without one of these, nobody is counted absent (a missing output entry is "no output logged",
  not absence).
* **Scheduled days(e, period)** = days that are not `Week Off` / `Public Holiday`.
* **Attendance %** = Σ presence_weight ÷ scheduled days × 100.

### 6.2 Output

* **Output(e, d, p)** = qty from `User Input` for that Output_Date (decimals kept).
* **Daily / weekly (Mon–Sun) / monthly output** = Σ Output over the period, by process or family.
* **Total output (headline)** = Σ qty over all processes, labelled **"WTG process-steps"**, because one
  turbine passing Prescreen, Analysis and FQC counts 3 times. It is always shown with the
  per-process breakdown, and **Delivered** (§6.4) is the turbine-level count.
* **Target-day share** of a row = `qty ÷ target_per_day(p)`. One target-day = one full day's
  expected work, which makes different processes comparable.

### 6.3 Productivity & target achievement (D3)

* **Target-days earned(e, d)** = Σ_p Output(e,d,p) ÷ target_per_day(p), over processes that have a target.
* **Productivity %(e, period)** = Σ_d target-days earned ÷ Σ_d presence_weight(e,d) × 100.
  The denominator is the present days from the calendar, so a present day with no output
  lowers productivity. Output on an off day still counts in the numerator and is flagged.
* **Target coverage %** = share of a person's raw output in processes that have a target. It is
  shown next to every productivity figure, so people doing mostly untargeted work (Pilot uploads,
  Critical Review…) aren't mis-ranked. Ranking uses only employees with coverage ≥ 70 % and ≥ 5 present days in the period (editable in Settings).
* **Team productivity %** = Σ_e target-days earned ÷ Σ_e presence days × 100.
* **Target vs actual (process p, period)**: target = target_per_day(p) × presence-days spent on p
  (a day counts toward p when the person logged p that day, split by target-day share);
  actual = Σ Output. Shown per process.

Process → target mapping (from `Target` tab, using the *Average WTG/Day* column):

| User Input column | Target/day | Source row |
|---|---|---|
| Ext_Prescreen | 19 | External · PreScreen |
| Ext_Analysis | 7.5 | External · Analysis |
| Ext_FQC | 11 | External · FQC |
| Int_Pre+Analysis | 3.1 | Internal · PreScreen + Analysis |
| Int_FQC | 3.3 | Internal · FQC |
| ZDT Prescreen+Analysis | 9.5 | ZDT · PreScreen + Analysis |
| ZDT FQC | 11.5 | ZDT · FQC |
| ZDT Data Process | 8 | ZDT · Data Processing |
| Data Process | 7 | Internal-DP · Data Processing |
| Audit-2026 | 11 | Audit · Audit Work |
| ZDT Pitch Beraring Data Process | 8 | same as ZDT · Data Processing (decision 23 Nov) |
| ZDT Pitch Beraring Prescreen+Analysis | 9.5 | same as ZDT · PreScreen + Analysis |
| ZDT Pitch Beraring FQC | 11.5 | same as ZDT · FQC |
| Skyspecs Data upload | **in productivity; target read from the `Target` tab** | no row exists yet, so it shows "target missing" until one is added |
| Full Internal Inspection(P+A+FQC) | only if a `Target` tab row exists (none today) | no derived values (decision 23 Nov) |
| Ext_QI Resolved, Critical Review, SN Update Insights, Ext/Int_Eng Review, Int_QI Resolved+Blade swap, Pilot-Uploaders, Data Process_QI-Rework, Nacelle, Tower, Cooler Top, HUB Inspection, Nordex Calculation, ZDT QI Resolved | counted as output, **excluded** from productivity | decision 23 Nov |

Targets are **never hard-coded or derived**. They are read from the `Target` tab on every sync,
and the mapping above only links a `User Input` column to a `Target` row (Method + Process).
The target used is always shown next to each productivity figure. The `Target` tab's range
(e.g. "10-12") and average (11) are both shown; the average is used in the calculation.
The per-person targets in the leave tracker's `Team` tab (a January snapshot that is no longer
maintained) differ from these and are **not** used.

### 6.4 Deliveries (from `Active ZV`, per stream External / Internal / ZDT)

* **Delivered (period)** = Σ `Delivered/Day` (verified: External delivered = total of `Ext_FQC`).
* **Uploaded (period)** = Σ `Upload/Day`.
* **Pending deliveries** = `Current Inventory` on the latest date with data.
* **Quality issues open** = `Quality Issue` on the latest date; trend shown daily.
* **Duplicates / Late uploads / Audit count** = Σ over the period.
* **Delivery rate %** = delivered ÷ (delivered + inventory at period end) × 100.
* **Rework/QI resolved** = Σ of `Ext_QI Resolved`, `Int_QI Resolved+Blade swap`, `ZDT QI Resolved`,
  `Data Process_QI-Rework` from `User Input`.
* Not available from the sheets (shown as "not tracked"): per-WTG status, WTG IDs, project names,
  aging of individual WTGs, reshoot lists.

### 6.5 Leave

* **Leave request counts** = `Leave Tracker` by Approval Status. Pending = status not in
  {Approved, Declined}; reconciled to the `Dashboard` cards.
* **Effective leave** = Approved **and** calendar status ≠ `Revert Leave`.
* **Upcoming leaves** = effective leave with start date > today.
* **Leave days** = counted from `calendar_days` (half codes = 0.5), not from request date ranges.
* **Unplanned leave** = Request = *Time Off – Unplanned*.

### 6.6 Tasks (in-app)

Statuses: Not Started, In Progress, Pending, Under Review, On Hold, Completed. **Overdue** is
computed (due_on < today and status ≠ Completed), never stored. Workload = open tasks per assignee.

### 6.7 Change vs previous period

Every KPI card compares with the previous equal-length period and shows Δ and Δ %. A single day
compares with the **previous working day** (a day on which at least half the active roster was
scheduled, so Saturdays with a few people working are skipped). Daily / weekly / monthly output
windows end at the latest working day that most present people have logged (people log at the
end of their day). If the previous value is 0 the % is shown as "—".

### 6.8 Overtime

`Wind OT tracker 2026` rows are matched to people by Employee ID, then by name (Calendar View,
Employee ID and Employee List names). Shift "Half Day" = 0.5, otherwise 1. Shown per person on
the profile page; output itself always comes from User Input, so overtime is never double-counted.

---

## 7. Alerts (in-app; channel adapters for email/Slack/Teams are stubbed and disabled)

| Alert | Default threshold |
|---|---|
| On leave today | always (info) |
| Unplanned absence | approved unplanned request or LoP today |
| Low daily output | productivity for the day < 60 % on a present day |
| Missed target (week) | weekly productivity < 80 % |
| No output logged | present working day with no `User Input` row by 10:00 next day |
| Inventory rising | current inventory up > 15 % in 5 working days |
| Quality issues high | open quality issues > configurable count |
| Overdue task | due date passed |
| Data sync failure | any failed run |
| Data-quality errors | new error-severity `sync_issues` |

All thresholds are editable in Settings.

---

## 8. Application structure

```
app/
  (auth)/login                 Google sign-in, @zeitview.com only
  (app)/overview               KPI cards, trends, attention panel
  (app)/attendance             today, calendar heat-map, leave log, distribution, trends
  (app)/output                 per-process/person output, deliveries (Active ZV), QI/rework
  (app)/tasks                  board + table, create/assign/update, workload
  (app)/employees/[email]      profile & performance; /employees/compare
  (app)/reports                daily / weekly / monthly; export XLSX, CSV, PDF
  (app)/alerts                 feed + rules
  (app)/data-sources           sheets, sync runs, data-quality issues, "Sync now"
  (app)/settings               targets override, thresholds, users & roles
  api/sync                     protected sync endpoint (cron secret / admin session)
  api/export/[report]          server-side exports
lib/
  sheets/                      Google client + one parser per tab
  domain/                      KPI calculations (pure, unit-tested)
  db/                          Drizzle schema & migrations
```

Stack: Next.js 15 (App Router, React Server Components), TypeScript, Tailwind + shadcn/ui,
Apache ECharts, TanStack Table, Drizzle ORM, Supabase Postgres, Auth.js (Google, `hd`
claim + server-side domain check), zod, exceljs / papaparse, server-rendered PDF.
Roles: admin, manager, lead, viewer (the employee-login role is reserved for later).

## 9. Testing & validation

* Unit tests for every parser (date formats, codes, prose timestamps) and every KPI.
* **Reconciliation tests on live data**: per-person per-day output vs each process pivot tab;
  delivered vs `Active ZV`; headcount vs `Calendar View` row 3; leave counts vs `Dashboard`.
  Any mismatch is shown in Data Sources.
* Playwright checks for each page at desktop, tablet and phone widths.

## 10. What is needed from you

Step-by-step setup is in [`web/README.md`](../web/README.md): a Google Cloud project (service
account + OAuth client), a Supabase project and a Vercel project.

## 11. Deployment notes (learned while going live)

* **Database connection:** use Supabase's **Session pooler** (port 5432). The Transaction pooler
  (6543) made pages that run ~10 queries at once hang until Vercel's 300 s limit, even with
  query pipelining disabled; the Direct connection is IPv6-only and unreachable from Vercel.
* **Safety nets:** database calls on pages fail after 25–60 s with a readable message
  (`withDbTimeout`), pages show a loading skeleton and an error panel instead of a blank screen,
  and `/api/health` reports the database's own error text (secrets redacted).
* **Cross-check values** (`reference_values`) are de-duplicated per key and can never fail a sync.
  The leave Dashboard is read only from its summary-card row.

### Identity matching (added 25 Nov)

* `@dronebase.com` addresses are the same people as `@zeitview.com` (`EMAIL_DOMAIN_ALIASES`).
* Calendar View rows without an email (e.g. the *Resigned* section) are linked to the email their
  output / leave uses when exactly one email matches the name (`src/lib/sync/identity.ts`); every
  link is listed as a `linked_by_name` note in Data Sources.
* OT tracker names fall back to "first name + surname initial" when that is unique
  ("Guruprasad B" → "Guruprasad basavaraju").

### Teams (decision 25 Nov)

Calendar View sections are **sub-teams** grouped into teams (`src/lib/teams.ts`):

| Team | Sub-teams (Calendar View section) |
|---|---|
| Wind Team | **Wind Team (core)** = the unnamed first section + Data Process + WFH sections · GWO (Field operations) · LM Blade Pilot |
| Properties-Wind-Utilities Cross Vertical | — |
| Encord Team | Encord Project |
| Former members (inactive) | Resigned/Layed OFF People · Department changed |

The Team filter accepts a whole team or one sub-team. A new section added to Calendar View
appears as its own team until it is added to the mapping.
