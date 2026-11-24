# Wind Ops — Team Operations & Performance

One web app for attendance & leave, output & deliveries, tasks, employee performance, reports and
alerts, fed live (read-only) from the team's three Google Sheets.

- **Data model, sheet mapping and every KPI formula:** [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
- **Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS 4, ECharts, TanStack Table,
  Drizzle ORM + Postgres (Supabase), Auth.js (Google, domain-restricted), Google Sheets API.

```
src/
  app/(app)/…            pages: overview, attendance, output, tasks, employees, reports, alerts,
                         data-sources, settings, search
  app/api/sync           sync endpoint (scheduler with CRON_SECRET, or a signed-in manager)
  app/api/export         XLSX / CSV / PDF / JSON report export
  lib/sheets/            Google client + one parser per tab (all business rules for reading data)
  lib/sync/              collect → reconcile → apply-changes pipeline, sync log
  lib/domain/            KPI engine (pure functions), reports, alerts, settings
  lib/db/                Drizzle schema; migrations live in ./drizzle
tests/                   unit tests (parsers, KPI formulas)      → npm test
e2e/                     browser tests (every page, tasks, sync, exports, mobile) → npm run e2e
scripts/                 make-fixture (synthetic data), sync (CLI)
```

---

## 1. One-time setup (≈ 30 minutes)

### 1.1 Google Cloud: service account (reads the sheets)
1. Open <https://console.cloud.google.com/>, create a project (e.g. `wind-ops`).
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create service account** (`wind-ops-reader`). No roles needed.
4. Open it → **Keys → Add key → JSON**. Keep the file safe; it goes into `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. In each of the three Google Sheets: **Share →** add the service account's email
   (`wind-ops-reader@<project>.iam.gserviceaccount.com`) as **Viewer**. Untick "Notify people".

The app only requests the `spreadsheets.readonly` scope: it cannot change the sheets.

### 1.2 Google Cloud: OAuth client (staff sign-in)
1. **APIs & Services → OAuth consent screen →** User type **Internal** (limits sign-in to your Workspace).
2. **Credentials → Create credentials → OAuth client ID →** *Web application*.
   - Authorised redirect URI: `https://<your-app-domain>/api/auth/callback/google`
     (add `http://localhost:3000/api/auth/callback/google` for local testing).
3. Copy the client ID / secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

Sign-in is checked three times: Google's `hd` hint, the verified-email domain, and the `hd` claim
must all equal `ALLOWED_EMAIL_DOMAIN`.

### 1.3 Supabase (database)
1. Create a project at <https://supabase.com/> (region close to India, e.g. Mumbai).
2. **Project Settings → Database → Connection string → Transaction pooler** → `DATABASE_URL`.
3. Tables are created automatically on first start (migrations in `./drizzle`).

### 1.4 Vercel (hosting)
1. Import this GitHub repository in Vercel, set **Root Directory = `web`**.
2. Add every variable from [`.env.example`](.env.example) (Production + Preview).
3. Deploy, open the site, sign in with an `ADMIN_EMAILS` account, go to **Data Sources → Sync now**.

### 1.5 Scheduled sync
The repository includes `.github/workflows/wind-ops-sync.yml` (every 15 min 06:30–23:15 IST,
full reconciliation at 02:00 IST). To enable it:
- GitHub → Settings → Secrets and variables → Actions:
  - secrets `WIND_OPS_URL` (your app URL) and `WIND_OPS_CRON_SECRET` (same value as `CRON_SECRET`)
  - variable `WIND_OPS_SYNC_ENABLED` = `true`

Any other scheduler works too (Supabase `pg_cron` + `pg_net`, Vercel Cron on a Pro plan):
it only needs to `POST /api/sync?mode=quick|full` with `Authorization: Bearer <CRON_SECRET>`.

---

## 2. Local development

```bash
cd web
npm install
cp .env.example .env.local   # then either fill in real values, or use the synthetic fixture:
npm run fixture              # writes fixtures/demo.json (fake people, real sheet layouts)
# .env.local: SHEETS_FIXTURE_FILE=fixtures/demo.json, APP_TODAY=2026-11-23, AUTH_DEV_BYPASS=1, AUTH_SECRET=dev
npm run sync -- full         # loads the data into the embedded Postgres (.data/pglite)
npm run dev                  # http://localhost:3000
```

Checks:
```bash
npm test          # parser + KPI unit tests
npm run typecheck
npm run e2e       # browser tests (needs the fixture + AUTH_DEV_BYPASS=1)
```

---

## 3. How synchronisation works
1. Every tab is read with one `batchGet` per workbook (formatted values, exactly as shown).
2. Each tab has its own parser (`src/lib/sheets/parsers`). Dates are parsed **day-first**;
   identities are keyed by normalised email; repeats, invalid rows and unknown codes become
   data-quality issues instead of being silently counted.
3. Rows are compared with the database by business key + content hash; only new, changed or removed
   rows are written (shown as "changes detected" in Data Sources).
4. If a workbook or tab fails, its tables keep their previous data; the run is marked *partial* /
   *failed* and a **Data sync failure** alert is raised.
5. A *full* sync also compares every per-process pivot tab (Ext_FQC, Audit-2026, …), the leave
   Dashboard cards and Calendar View with the app's own numbers.
6. Alerts are recomputed after every sync and task change.

## 4. Connecting additional sheets / columns
- **New process column in User Input:** it is picked up automatically as output (category
  *Other*, no target) and flagged in Data Sources. To categorise it or count it in productivity,
  add one line to `PROCESSES` in `src/lib/processes.ts` naming its family and the Target-tab row.
- **New or changed target:** edit the **Target** tab. Targets are read live; nothing to deploy.
  (Skyspecs Data upload is already configured to count as soon as a Target row containing
  "Skyspecs" exists.)
- **New tab or workbook:** add it to `WORKBOOKS` in `src/lib/config.ts` (+ an env var for its ID),
  write a parser in `src/lib/sheets/parsers/` with a unit test, add a table to
  `src/lib/db/schema.ts` (`npm run db:generate`), wire it in `src/lib/sync/collect.ts` and
  `src/lib/sync/run.ts`, then share the sheet with the service account.
- **New team / person:** add them to Calendar View (the official roster). People who log output
  without being in Calendar View are listed under Data Sources → data-quality issues.

## 5. Maintenance
- **Data Sources** page: last successful sync, every run, per-tab changes and data-quality issues.
- **Settings**: alert thresholds, ranking rule, alert types, notification channels, user roles.
- `GET /api/health` returns the last successful sync time (for uptime monitoring).
- Upgrading dependencies: `npm outdated`, update, then `npm test && npm run typecheck && npm run e2e`.
- Database schema changes: edit `schema.ts` → `npm run db:generate` → commit the new file in
  `./drizzle`; it is applied automatically on the next start.

## 6. Roles
| Role | Can |
|---|---|
| viewer | see every page, export reports |
| lead | + create/update tasks, acknowledge alerts |
| manager | + delete tasks, run a manual sync |
| admin | + settings, thresholds, user roles |
