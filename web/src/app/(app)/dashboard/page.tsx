import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { AlertTriangle, CalendarClock, Flag, Trophy } from "lucide-react";
import { currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getDataset } from "@/lib/domain/dataset";
import { addDays, fmtDate, monthStart } from "@/lib/domain/dates";
import { dayStatus, deliverySummary, headcount, latestOutputDay, outputSummary, submissionsInScope, teamPerformance, teamTotals, upcomingLeave } from "@/lib/domain/metrics";
import { pipelineView, prioritySites } from "@/lib/domain/pipeline";
import { canApproveFor, getDataMode, whoAmI } from "@/lib/entry/store";
import { FAMILIES } from "@/lib/processes";
import { isDone } from "@/lib/pipeline";
import { teamOf, teamTree } from "@/lib/teams";
import { FAMILY_COLOR, fmtNum, fmtPct } from "@/lib/view";
import { Badge, Card, CardBody, CardHeader, Empty } from "@/components/ui";
import { SegmentedBar } from "@/components/segmented";
import { AutoRefresh } from "@/components/auto-refresh";
import { HeroStat, SectionTitle, TrackerCard, Turbines } from "@/components/dashboard";

export const dynamic = "force-dynamic";

const GROUPS = ["External Blade", "Internal Blade", "Zero Down Time", "Uploads"] as const;

export default async function Dashboard() {
  const user = await currentUser();
  const [ds, mode] = await Promise.all([getDataset(), getDataMode()]);
  const today = ds.today;
  const month = { from: monthStart(today), to: today };
  const db = await getDb();
  const [pipeline, sites, openAlerts] = await Promise.all([
    pipelineView(today),
    prioritySites(),
    db.select().from(schema.alerts).where(isNull(schema.alerts.resolvedAt)),
  ]);
  const SEV: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  openAlerts.sort((a, b) => (SEV[a.severity] ?? 3) - (SEV[b.severity] ?? 3) || b.date.localeCompare(a.date));

  // pending approvals in my scope (in-app entry only)
  let pending = 0;
  if (mode === "app" && user.role !== "viewer") {
    const me = await whoAmI(user);
    const [lv, ot] = await Promise.all([
      db.select({ k: schema.leaveRequests.employeeKey }).from(schema.leaveRequests).where(eq(schema.leaveRequests.approvalStatus, "Pending")),
      db.select({ k: schema.overtimeEntries.employeeKey }).from(schema.overtimeEntries).where(and(eq(schema.overtimeEntries.status, "Pending"))),
    ]);
    pending = [...lv, ...ot].filter((r) => r.k && canApproveFor(me, ds.emp.get(r.k))).length;
  }

  // people
  const hc = headcount(ds, today);
  const status = dayStatus(ds, today);
  const onLeave = status.filter((r) => r.status === "leave" || r.status === "half_leave");
  const absent = status.filter((r) => r.status === "absent");
  const upcoming = upcomingLeave(ds, {}, 7);

  // output: latest reported day, per process (never added across processes)
  const outDay = latestOutputDay(ds);
  const dayOut = outputSummary(ds, { from: outDay, to: outDay });
  const peopleOn = new Map<string, number>();
  for (const s of submissionsInScope(ds, { from: outDay, to: outDay })) for (const p of Object.keys(s.entries)) peopleOn.set(p, (peopleOn.get(p) ?? 0) + 1);
  const processes = Object.entries(dayOut.byProcess)
    .map(([col, qty]) => ({ info: ds.processes.get(col)!, qty, people: peopleOn.get(col) ?? 0 }))
    .sort((a, b) => FAMILIES.indexOf(a.info.family) - FAMILIES.indexOf(b.info.family) || b.qty - a.qty);

  // performance this month
  const totals = teamTotals(ds, month);
  const teams = teamTree(ds.employees.filter((e) => e.isActive)).map((g) => ({ team: g.team, t: teamTotals(ds, { ...month, section: g.team }) }));
  const top = teamPerformance(ds, month).filter((p) => p.rank != null).slice(0, 5);
  const streams = deliverySummary(ds, month);

  const openSites = sites.filter((s) => !isDone(s.status));
  const lastCount = pipeline.filter((p) => p.updatedAt || p.asOf).sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))[0];
  const now = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="fade-in">
      {/* ---------------- hero ---------------- */}
      <section className="wind-hero relative overflow-hidden rounded-3xl px-5 py-6 text-white shadow-card md:px-8 md:py-7" aria-labelledby="dash-title">
        <Turbines className="pointer-events-none absolute top-14 right-[-20px] hidden sm:block h-[130px] w-[270px] text-white/40 sm:right-[-10px] md:top-12 md:h-[170px] md:w-[360px] md:text-white/55" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium tracking-[0.14em] text-white/70 uppercase">Wind Analytics · Command Center</p>
            <h1 id="dash-title" className="mt-1 text-[26px] font-semibold tracking-tight md:text-[30px]">
              {now}
            </h1>
            <p className="mt-1 text-[13px] text-white/80">
              {mode === "app" ? "Live from in-app entries" : "Synced from the Google Sheets"}
              {lastCount?.asOf ? ` · pipeline counted ${fmtDate(lastCount.asOf)}${lastCount.updatedBy ? ` by ${ds.emp.get(lastCount.updatedBy)?.name ?? lastCount.updatedBy.split("@")[0]}` : ""}` : ""}
            </p>
          </div>
          <AutoRefresh seconds={60} />
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          <HeroStat label="Present today" value={fmtNum(hc.present, 1)} sub={`of ${hc.active} · ${hc.wfh} WFH`} href="/attendance?preset=today" />
          <HeroStat label="On leave" value={fmtNum(hc.onLeave)} sub={hc.unplannedLeave ? `${hc.unplannedLeave} unplanned` : "planned"} href="/attendance?preset=today" />
          <HeroStat label="Absent (LoP)" value={fmtNum(hc.absent)} sub={hc.noOutputLogged ? `${hc.noOutputLogged} not logged yet` : "everyone logged"} />
          <HeroStat label="Productivity" value={fmtPct(totals.productivityPct)} sub={`this month · ${fmtNum(totals.targetDays, 0)} target-days`} href="/employees" />
          <HeroStat label={`Output ${fmtDate(outDay)}`} value={fmtNum(dayOut.targetDays, 1)} sub={`target-days · ${dayOut.people} people`} href={`/output?preset=custom&from=${outDay}&to=${outDay}`} />
          {mode === "app" && user.role !== "viewer" ? (
            <HeroStat label="Approvals" value={pending} sub="waiting for you" href="/approvals" />
          ) : (
            <HeroStat label="Open alerts" value={openAlerts.length} sub={`${openAlerts.filter((a) => a.severity === "critical").length} critical`} href="/alerts" />
          )}
        </div>
      </section>

      {/* ---------------- pipeline ---------------- */}
      <SectionTitle aside={<Link href="/inventory#pipeline" className="text-accent hover:underline">{mode === "app" ? "Update counts" : "How it's counted"}</Link>}>Inventory pipeline</SectionTitle>
      {pipeline.every((p) => !p.asOf) ? (
        <Empty title="No pipeline counts yet">{mode === "app" ? "Leads record the daily count per tracker on the Inventory page." : "Counts are read from the Wind-Inventory Count sheet on every sync."}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GROUPS.flatMap((g) => pipeline.filter((p) => p.tracker.group === g)).map((v) => (
            <TrackerCard key={v.tracker.id} v={v} today={today} />
          ))}
        </div>
      )}

      {/* ---------------- priority + today's work ---------------- */}
      <div className="mt-7 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title={<span className="inline-flex items-center gap-2"><Flag size={16} className="text-accent" aria-hidden /> Priority sites</span>} subtitle={`${openSites.length} open · requested by Ops coordinators`} actions={<Link href="/inventory#priority" className="text-[12.5px] font-medium text-accent hover:underline">Manage</Link>} />
          {openSites.length === 0 ? (
            <div className="p-4"><Empty title="No open priority sites" /></div>
          ) : (
            <ul className="divide-y divide-line">
              {openSites.slice(0, 7).map((s) => {
                const late = s.etd && s.etd < today;
                const soon = s.etd && !late && s.etd <= addDays(today, 2);
                return (
                  <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{s.site}</span>
                      <span className="block truncate text-[12px] text-ink-2">
                        {[s.customer, s.wtgs != null ? `${s.wtgs} WTGs` : null, s.requestedBy && `for ${s.requestedBy}`, s.sla && `SLA ${s.sla}`].filter(Boolean).join(" · ")}
                      </span>
                      {(s.prescreen || s.analysis || s.fqc) && (
                        <span className="tnum mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
                          {s.prescreen && <span>Prescreen {s.prescreen}</span>}
                          {s.analysis && <span>Analysis {s.analysis}</span>}
                          {s.fqc && <span>FQC {s.fqc}</span>}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <Badge tone={/hold/i.test(s.status) ? "warning" : "neutral"}>{s.status || "Open"}</Badge>
                      {s.etd && <span className={`text-[11.5px] ${late ? "font-medium text-critical" : soon ? "font-medium text-warning" : "text-muted"}`}>{late ? "overdue · " : ""}ETD {fmtDate(s.etd)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Work logged" subtitle={`${fmtDate(outDay, true)} · each process counted on its own`} actions={<Link href={`/output?preset=custom&from=${outDay}&to=${outDay}`} className="text-[12.5px] font-medium text-accent hover:underline">Log</Link>} />
          {processes.length === 0 ? (
            <div className="p-4"><Empty title="Nothing logged yet today" /></div>
          ) : (
            <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
              {processes.map(({ info, qty, people }) => (
                <li key={info.column} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: FAMILY_COLOR[info.family] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{info.label}</span>
                    <span className="block text-[11.5px] text-muted">{info.family} · {people} {people === 1 ? "person" : "people"}</span>
                  </span>
                  <span className="tnum text-right text-[15px] font-semibold text-ink">{fmtNum(qty, 2)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------- people + performance ---------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Attendance today" subtitle={`${hc.active} active people`} actions={<Link href="/attendance?preset=today" className="text-[12.5px] font-medium text-accent hover:underline">Details</Link>} />
          <CardBody>
            <SegmentedBar
              label="Attendance today"
              parts={[
                { name: "Office", value: Math.max(0, hc.present - hc.wfh - hc.training), color: "var(--s1)" },
                { name: "WFH", value: hc.wfh, color: "var(--s3)" },
                { name: "Training", value: hc.training, color: "var(--s7)" },
                { name: "Leave", value: hc.onLeave, color: "var(--s2)" },
                { name: "Absent", value: hc.absent, color: "var(--critical)" },
              ]}
              format={(v) => fmtNum(v, 1)}
            />
            <h3 className="mt-4 mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">On leave today</h3>
            {onLeave.length + absent.length === 0 ? (
              <p className="text-[13px] text-ink-2">Everyone is in.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {[...onLeave, ...absent].map((r) => (
                  <li key={r.employee.key}>
                    <Badge tone={r.status === "absent" ? "critical" : r.unplanned ? "warning" : "neutral"}>
                      {r.employee.name} · {r.status === "absent" ? "LoP" : `${r.status === "half_leave" ? "½ " : ""}${r.leaveType ?? "leave"}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-4 mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase"><CalendarClock size={13} aria-hidden /> Next 7 days</h3>
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-ink-2">No approved leave coming up.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-[12.5px]">
                {upcoming.slice(0, 6).map((l) => (
                  <li key={l.workflowId} className="flex justify-between gap-2">
                    <span className="truncate text-ink">{ds.emp.get(l.employeeKey)?.name ?? l.employeeKey}</span>
                    <span className="tnum shrink-0 text-ink-2">{l.leaveType} · {fmtDate(l.startDate!)}{l.endDate && l.endDate !== l.startDate ? `–${fmtDate(l.endDate)}` : ""}</span>
                  </li>
                ))}
                {upcoming.length > 6 && <li className="text-muted">+{upcoming.length - 6} more</li>}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Productivity by team" subtitle={`This month · target-days ÷ present days`} actions={<Link href="/employees" className="text-[12.5px] font-medium text-accent hover:underline">People</Link>} />
          <CardBody>
            <ul className="flex flex-col gap-3">
              {teams.map(({ team, t }) => {
                const pct = t.productivityPct;
                const w = pct == null ? 0 : Math.min(pct, 130) / 1.3;
                return (
                  <li key={team}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] text-ink">{team}</span>
                      <span className="tnum text-[13px] font-semibold text-ink">{fmtPct(pct)}</span>
                    </div>
                    <div className="relative mt-1 h-2 rounded-full bg-surface-2" title={`${team}: ${fmtPct(pct)} (${fmtNum(t.targetDays, 1)} target-days / ${fmtNum(t.presentDays, 1)} present days)`}>
                      <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--s1)]" style={{ width: `${w}%` }} />
                      <span className="absolute -top-1 -bottom-1 w-[2px] bg-ink-2" style={{ left: `${100 / 1.3}%` }} aria-hidden />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-right text-[11.5px] text-muted">Marker = 100% of target</p>
            <h3 className="mt-4 mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase"><Trophy size={13} aria-hidden /> Top performers</h3>
            {top.length === 0 ? (
              <p className="text-[13px] text-ink-2">Nobody meets the ranking rule yet this month.</p>
            ) : (
              <ol className="flex flex-col gap-1 text-[13px]">
                {top.map((p) => (
                  <li key={p.employee.key} className="flex items-center gap-2">
                    <span className="tnum w-5 text-muted">{p.rank}</span>
                    <Link href={`/employees/${encodeURIComponent(p.employee.key)}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent hover:underline">{p.employee.name}</Link>
                    <span className="hidden truncate text-[11.5px] text-muted sm:inline">{teamOf(p.employee.section).subTeam}</span>
                    <span className="tnum font-semibold text-ink">{fmtPct(p.productivityPct)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Deliveries & alerts" subtitle="This month per stream" actions={<Link href="/output#deliveries" className="text-[12.5px] font-medium text-accent hover:underline">Output</Link>} />
          <CardBody>
            <ul className="grid grid-cols-3 gap-2">
              {streams.map((st) => (
                <li key={st.stream} className="rounded-xl bg-surface-2 p-2.5">
                  <span className="block text-[11.5px] text-muted">{st.stream}</span>
                  <span className="tnum block text-[18px] font-semibold text-ink">{fmtNum(st.delivered)}</span>
                  <span className="block text-[11px] text-ink-2">delivered</span>
                  <span className="tnum mt-1 block text-[11.5px] text-ink-2">{fmtNum(st.inventory)} pending</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase"><AlertTriangle size={13} aria-hidden /> Alerts</h3>
            {openAlerts.length === 0 ? (
              <p className="text-[13px] text-ink-2">No open alerts.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {openAlerts.slice(0, 5).map((a) => (
                  <li key={a.key} className="flex items-start gap-2 text-[12.5px]">
                    <Badge tone={a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "neutral"}>{a.severity}</Badge>
                    <span className="min-w-0 text-ink">{a.title}</span>
                  </li>
                ))}
                {openAlerts.length > 5 && (
                  <li>
                    <Link href="/alerts" className="text-[12.5px] text-accent hover:underline">All {openAlerts.length} alerts</Link>
                  </li>
                )}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
