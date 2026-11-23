import { desc, eq } from "drizzle-orm";
import { ExternalLink, FileSpreadsheet } from "lucide-react";
import { can, currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { sheetUrl, WORKBOOKS, type WorkbookId } from "@/lib/config";
import { Badge, Card, CardBody, CardHeader, Empty, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/data-table";
import { SyncButtons } from "@/components/admin-client";
import { getDataset } from "@/lib/domain/dataset";

export const dynamic = "force-dynamic";

const TABLE_SOURCE: Record<string, string> = {
  employees: "Calendar View (+ Employee ID)",
  output: "User Input",
  calendar: "Calendar View",
  leave: "Leave Tracker",
  delivery: "Active ZV",
  targets: "Target",
  overtime: "Wind OT tracker 2026",
};

const ist = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function DataSources() {
  const user = await currentUser();
  const db = await getDb();
  const runs = await db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(40);
  const last = runs[0];
  const lastGood = runs.find((r) => r.status === "success" || r.status === "partial");
  const issues = last ? await db.select().from(schema.syncIssues).where(eq(schema.syncIssues.runId, last.id)) : [];
  const ds = await getDataset();
  const mode = process.env.SHEETS_FIXTURE_FILE ? "fixture" : "google";

  const counts = {
    error: issues.filter((i) => i.severity === "error").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };

  return (
    <div className="fade-in">
      <PageHeader title="Data sources & integrations" subtitle="All data is read-only from Google Sheets. Nothing is written back to the sheets." actions={<SyncButtons allowed={can(user, "manager")} />} />

      {mode === "fixture" && (
        <p className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--warning)_50%,transparent)] bg-warning-soft px-4 py-3 text-[13px] text-ink">
          <strong>Development mode:</strong> reading a local synthetic snapshot (<code>{process.env.SHEETS_FIXTURE_FILE}</code>) instead of the live Google Sheets. Unset <code>SHEETS_FIXTURE_FILE</code> and configure the service account to use real data.
        </p>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Synchronisation" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-ink-2">Last successful sync</dt>
                <dd className="font-medium text-ink">{ist(lastGood?.finishedAt ?? null)}</dd>
              </div>
              <div>
                <dt className="text-ink-2">Last attempt</dt>
                <dd className="font-medium text-ink">
                  {ist(last?.startedAt ?? null)}{" "}
                  {last && <Badge tone={last.status === "success" ? "good" : last.status === "partial" ? "warning" : last.status === "running" ? "accent" : "critical"}>{last.status}</Badge>}
                </dd>
              </div>
              <div>
                <dt className="text-ink-2">Schedule</dt>
                <dd className="text-ink">Every 15 min, 06:30–23:15 IST · full reconciliation 02:00 IST</dd>
              </div>
              <div>
                <dt className="text-ink-2">Data quality (last run)</dt>
                <dd className="flex flex-wrap gap-1">
                  <Badge tone={counts.error ? "critical" : "good"}>{counts.error} errors</Badge>
                  <Badge tone={counts.warning ? "warning" : "neutral"}>{counts.warning} warnings</Badge>
                  <Badge>{counts.info} notes</Badge>
                </dd>
              </div>
            </dl>
            {last?.error && <p className="mt-3 rounded-lg bg-critical-soft px-3 py-2 text-[12.5px] text-critical">{last.error}</p>}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Connected sheets" subtitle="Read with a Google service account (spreadsheets.readonly scope)" />
          <CardBody>
            <ul className="grid gap-3 md:grid-cols-3">
              {(Object.keys(WORKBOOKS) as WorkbookId[]).map((wb) => {
                const url = sheetUrl(wb);
                return (
                  <li key={wb} className="rounded-xl border border-line p-3">
                    <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                      <FileSpreadsheet size={16} className="text-[var(--good-mark)]" aria-hidden /> {WORKBOOKS[wb].label}
                    </p>
                    <p className="mt-1 text-[12px] text-ink-2">Tabs: {WORKBOOKS[wb].tabs.join(", ")}{wb === "workstudy" ? " (+ per-process tabs on full sync)" : ""}</p>
                    <p className="mt-2 flex items-center gap-2 text-[12px]">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                          Open sheet <ExternalLink size={12} />
                        </a>
                      ) : (
                        <Badge tone={mode === "fixture" ? "neutral" : "critical"}>{WORKBOOKS[wb].env} not set</Badge>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12px] text-muted">
              Loaded now: {ds.employees.length} people, {ds.submissions.length.toLocaleString("en-IN")} output entries, {ds.calendar.size.toLocaleString("en-IN")} calendar days, {ds.leave.length.toLocaleString("en-IN")} leave requests, {ds.delivery.length} delivery rows, {ds.targets.length} targets.
            </p>
          </CardBody>
        </Card>
      </div>

      {last?.stats && (
        <Card className="mb-4">
          <CardHeader title="Last run — changes detected" subtitle="Rows are compared by business key and content hash; only new, changed or removed rows are written" />
          <CardBody>
            <DataTable
              searchable={false}
              filename="sync-changes"
              columns={[
                { key: "t", header: "Data set" },
                { key: "src", header: "Source tab" },
                { key: "read", header: "Rows read", align: "right" },
                { key: "ins", header: "New", align: "right" },
                { key: "upd", header: "Updated", align: "right" },
                { key: "del", header: "Removed", align: "right" },
                { key: "err", header: "Status" },
              ]}
              rows={Object.entries(last.stats as Record<string, { read: number; inserted: number; updated: number; deleted: number; error?: string }>).map(([k, s]) => ({
                t: k,
                src: TABLE_SOURCE[k] ?? k,
                read: s.read,
                ins: s.inserted,
                upd: s.updated,
                del: s.deleted,
                err: { v: s.error ?? "OK", badge: true, tone: s.error ? "critical" : "good" },
              }))}
            />
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader title="Data-quality issues (last run)" subtitle="Errors = rows not counted · warnings = counted but suspicious · notes = reconciliation results and information" />
        <CardBody>
          {issues.length === 0 ? (
            <Empty title="No issues" />
          ) : (
            <DataTable
              filename="data-quality"
              pageSize={20}
              initialSort={{ key: "sev" }}
              columns={[
                { key: "sev", header: "Severity" },
                { key: "src", header: "Sheet / tab" },
                { key: "ref", header: "Row / key" },
                { key: "code", header: "Type", hideOnMobile: true },
                { key: "msg", header: "Details" },
              ]}
              rows={issues.map((i) => ({
                sev: { v: i.severity === "error" ? 0 : i.severity === "warning" ? 1 : 2, label: i.severity, badge: true, tone: i.severity === "error" ? "critical" : i.severity === "warning" ? "warning" : "muted" },
                src: `${i.source} · ${i.tab}`,
                ref: i.rowRef,
                code: i.code,
                msg: i.message,
              }))}
            />
          )}
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Sync history" />
        <CardBody>
          <DataTable
            filename="sync-history"
            searchable={false}
            columns={[
              { key: "id", header: "Run", align: "right" },
              { key: "start", header: "Started (IST)" },
              { key: "dur", header: "Duration", align: "right" },
              { key: "mode", header: "Mode" },
              { key: "trig", header: "Trigger" },
              { key: "status", header: "Status" },
              { key: "err", header: "Error" },
            ]}
            rows={runs.map((r) => ({
              id: r.id,
              start: ist(r.startedAt),
              dur: r.finishedAt ? `${Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 100) / 10}s` : "—",
              mode: r.mode,
              trig: `${r.trigger}${r.triggeredBy ? ` · ${r.triggeredBy}` : ""}`,
              status: { v: r.status, badge: true, tone: r.status === "success" ? "good" : r.status === "partial" ? "warning" : r.status === "running" ? "muted" : "critical" },
              err: r.error ?? "—",
            }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Integrations" subtitle="Prepared for future use; nothing is sent until configured and enabled by an admin" />
        <CardBody>
          <ul className="grid gap-3 text-[13px] md:grid-cols-4">
            {[
              ["Google Sheets", "Connected (read-only)", "good"],
              ["Slack", process.env.SLACK_WEBHOOK_URL ? "Webhook configured" : "Not configured", process.env.SLACK_WEBHOOK_URL ? "accent" : "neutral"],
              ["Microsoft Teams", process.env.TEAMS_WEBHOOK_URL ? "Webhook configured" : "Not configured", process.env.TEAMS_WEBHOOK_URL ? "accent" : "neutral"],
              ["Email / WhatsApp", "Needs an authorised provider", "neutral"],
            ].map(([n, s, t]) => (
              <li key={n} className="rounded-xl border border-line p-3">
                <p className="font-medium text-ink">{n}</p>
                <Badge tone={t as "good"} className="mt-1">
                  {s}
                </Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
