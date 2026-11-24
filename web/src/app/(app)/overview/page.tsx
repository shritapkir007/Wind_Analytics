import Link from "next/link";
import { and, desc, inArray, isNull } from "drizzle-orm";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { loadPage } from "@/lib/page";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CardBody, CardHeader, Empty, KpiCard, PageHeader } from "@/components/ui";
import { ColumnChart, LineTrend } from "@/components/charts";
import { SegmentedBar } from "@/components/segmented";
import {
  change,
  comparisonPeriod,
  deliverySummary,
  headcount,
  outputSeries,
  outputSummary,
  taskSummary,
  latestOutputDay,
  teamPerformance,
  teamTotals,
  employeesInScope,
} from "@/lib/domain/metrics";
import { addDays, fmtDate, fmtRange, monthStart, weekStart } from "@/lib/domain/dates";
import { FAMILIES } from "@/lib/processes";
import { FAMILY_COLOR, fmtNum, fmtPct, qs, STREAM_COLOR, type SP } from "@/lib/view";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<SP> }) {
  const { ds, sp, v, filter, barProps, hasData } = await loadPage(searchParams);
  const today = ds.today;
  const scope = { section: v.section, employee: v.employee };

  if (!hasData)
    return (
      <>
        <PageHeader title="Overview" />
        <Empty title="No data yet">Run the first sync from Data Sources &amp; Integrations. The dashboard fills in as soon as the sheets are read.</Empty>
      </>
    );

  // --- today
  const hc = headcount(ds, today, scope);
  const prevDay = comparisonPeriod(ds, { from: today, to: today }).from;
  const hcPrev = headcount(ds, prevDay, scope);
  const active = employeesInScope(ds, scope).length;

  // --- output windows (fixed windows, independent of the period filter)
  // Output windows end at the latest working day with logged output (people log at day end).
  const lastOutputDate = latestOutputDay(ds);
  const dayF = { ...filter, from: lastOutputDate, to: lastOutputDate };
  const prevOutDay = comparisonPeriod(ds, { from: lastOutputDate, to: lastOutputDate });
  const day = outputSummary(ds, dayF);
  const dayPrev = outputSummary(ds, { ...filter, ...prevOutDay });
  const wk = { from: weekStart(lastOutputDate), to: lastOutputDate };
  const week = outputSummary(ds, { ...filter, ...wk });
  const weekPrev = outputSummary(ds, { ...filter, from: addDays(wk.from, -7), to: addDays(wk.to, -7) });
  const mo = { from: monthStart(lastOutputDate), to: lastOutputDate };
  const lastMonthStart = monthStart(addDays(mo.from, -1));
  const sameDayLastMonth = addDays(lastMonthStart, Math.min(Number(lastOutputDate.slice(8, 10)) - 1, 27));
  const month = outputSummary(ds, { ...filter, ...mo });
  const monthPrev = outputSummary(ds, { ...filter, from: lastMonthStart, to: sameDayLastMonth });

  // --- period (filter bar)
  const cmp = comparisonPeriod(ds, filter);
  const totals = teamTotals(ds, filter);
  const totalsPrev = teamTotals(ds, { ...filter, ...cmp });
  const out = outputSummary(ds, filter);
  const outPrev = outputSummary(ds, { ...filter, ...cmp });
  const del = deliverySummary(ds, filter);
  const delPrev = deliverySummary(ds, cmp);
  const delivered = del.reduce((a, s) => a + s.delivered, 0);
  const deliveredPrev = delPrev.reduce((a, s) => a + s.delivered, 0);
  const pending = del.reduce((a, s) => a + s.inventory, 0);
  const pendingPrev = delPrev.reduce((a, s) => a + s.inventory, 0);
  const qi = del.reduce((a, s) => a + s.qualityIssues, 0);
  const tasks = taskSummary(ds, scope);

  // --- trend (selected period, at least the last 30 days)
  const trendF = { ...filter, from: filter.from < addDays(filter.to, -29) ? filter.from : addDays(filter.to, -29) };
  const series = outputSeries(ds, trendF, v.grain);
  const cats = series.map((p) => (v.grain === "month" ? p.bucket.slice(0, 7) : fmtDate(p.bucket)));
  const famSeries = FAMILIES.filter((f) => series.some((p) => (p.byFamily[f] ?? 0) > 0)).map((f) => ({
    name: f,
    color: FAMILY_COLOR[f],
    stack: "out",
    data: series.map((p) => (p.byFamily[f] ? Math.round(p.byFamily[f]! * 100) / 100 : 0)),
  }));
  const prodSeries = [{ name: "Team productivity", color: "var(--s1)", data: series.map((p) => (p.productivityPct == null ? null : Math.round(p.productivityPct))) }];

  // --- attention
  const db = await getDb();
  const attention = await db
    .select()
    .from(schema.alerts)
    .where(and(isNull(schema.alerts.resolvedAt), inArray(schema.alerts.severity, ["critical", "warning"])))
    .orderBy(desc(schema.alerts.date))
    .limit(8);
  const perf = teamPerformance(ds, filter).filter((p) => p.rank != null);

  const q = (over: Record<string, string | null>) => qs(sp, over);
  const dLabel = (from: string, to: string) => `vs ${fmtRange(from, to)}`;
  const cmpLabel = `vs ${fmtRange(cmp.from, cmp.to)}`;

  return (
    <div className="fade-in">
      <PageHeader
        title="Operations overview"
        subtitle={
          <>
            Today is <strong className="font-medium text-ink">{fmtDate(today, true)}</strong> · period cards and charts use{" "}
            <strong className="font-medium text-ink">{fmtRange(v.from, v.to)}</strong>
          </>
        }
      />
      <FilterBar {...barProps} showGrain />

      {/* Today */}
      <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">People today</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total active employees" value={fmtNum(active)} sub={`${new Set(employeesInScope(ds, scope).map((e) => e.section)).size} teams · Calendar View roster`} href={`/employees${q({})}`} formula="People listed in Calendar View with an email, excluding the Resigned and Department Changed sections." />
        <KpiCard label="Present today" value={fmtNum(hc.present, 1)} sub={`${hc.wfh} WFH · ${hc.halfDay} half-day`} delta={{ ...change(hc.present, hcPrev.present), label: `vs ${fmtDate(prevDay)}` }} href={`/attendance${q({ preset: "today" })}`} formula="Same rule as the sheet's Headcount/Day row: blank, Working or WFH = 1; any half-day leave = 0.5. Week Off and Public Holiday are not working days." />
        <KpiCard label="On leave today" value={fmtNum(hc.onLeave)} sub={hc.weekOff || hc.holiday ? `${hc.weekOff} week off · ${hc.holiday} holiday` : "Planned leave codes in Calendar View"} delta={{ ...change(hc.onLeave, hcPrev.onLeave), upIsGood: false, label: `vs ${fmtDate(prevDay)}` }} href={`/attendance${q({ preset: "today" })}#today`} formula="People with a full or half-day leave code (EL, CL, WL, PL, EL CF, Comp Off) today, excluding approved unplanned requests (counted as absent)." />
        <KpiCard label="Absent today" value={fmtNum(hc.absent)} sub="LoP or approved unplanned leave" tone={hc.absent > 0 ? "warning" : "default"} delta={{ ...change(hc.absent, hcPrev.absent), upIsGood: false, label: `vs ${fmtDate(prevDay)}` }} href={`/attendance${q({ preset: "today" })}#today`} formula="LoP in Calendar View, or an approved 'Time Off – Unplanned' request covering today. A missing output entry is never counted as absence." />
      </div>

      <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Output (WTG process-steps)</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard label={`Daily output · ${fmtDate(lastOutputDate)}`} value={fmtNum(day.totalSteps)} sub={`${day.people} people logged`} delta={{ ...change(day.totalSteps, dayPrev.totalSteps), label: dLabel(prevOutDay.from, prevOutDay.to) }} href={`/output${q({ preset: "custom", from: lastOutputDate, to: lastOutputDate })}`} formula="Σ of every process column in User Input for the latest working day that most present people have logged (today after people log, otherwise the previous working day). One turbine passing Prescreen, Analysis and FQC counts 3 steps; see Deliveries for turbine counts." />
        <KpiCard label={`Weekly output · ${fmtRange(wk.from, wk.to)}`} value={fmtNum(week.totalSteps)} sub={`${fmtNum(week.targetDays, 1)} target-days earned`} delta={{ ...change(week.totalSteps, weekPrev.totalSteps), label: "vs same days last week" }} href={`/output${q({ preset: "this_week" })}`} formula="Σ User Input quantities from Monday to the latest reported working day, compared with the same weekdays of the previous week." />
        <KpiCard label={`Monthly output · ${fmtRange(mo.from, mo.to)}`} value={fmtNum(month.totalSteps)} sub={`${fmtNum(month.targetDays, 1)} target-days earned`} delta={{ ...change(month.totalSteps, monthPrev.totalSteps), label: "vs same days last month" }} href={`/output${q({ preset: "this_month" })}`} formula="Σ User Input quantities from the 1st of the month to the latest reported working day, compared with the same day-range of the previous month." />
      </div>

      <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Performance &amp; delivery · {fmtRange(v.from, v.to)}</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Team productivity" value={fmtPct(totals.productivityPct)} sub={`${fmtNum(totals.targetDays, 1)} target-days / ${fmtNum(totals.presentDays, 1)} present days`} delta={{ ...change(totals.productivityPct, totalsPrev.productivityPct), label: cmpLabel, suffix: " pts" }} tone={totals.productivityPct != null && totals.productivityPct < 80 ? "warning" : "default"} href={`/employees${q({})}`} formula={<>Σ(quantity ÷ process target per day) over targeted processes ÷ Σ present days (Calendar View). Targets come from the Target tab. 100% = every present day delivered one full day of target work.</>} />
        <KpiCard label="Target vs actual" value={fmtPct(totals.targetAchievementPct)} sub={`${fmtNum(totals.targetQtyActual)} of ${fmtNum(totals.targetQtyExpected)} expected`} delta={{ ...change(totals.targetAchievementPct, totalsPrev.targetAchievementPct), label: cmpLabel, suffix: " pts" }} href={`/output${q({})}#targets`} formula="Per targeted process: expected = target/day × present days spent on it (a day is split across the processes logged in proportion to their target share). Actual = logged quantity." />
        <KpiCard label="Completed deliveries" value={fmtNum(delivered)} unit="WTG" sub="Active ZV · Delivered/Day" delta={{ ...change(delivered, deliveredPrev), label: cmpLabel }} href={`/output${q({})}#deliveries`} formula="Σ Delivered/Day across Blade External, Blade Internal and ZDT in Active ZV for the period." />
        <KpiCard label="Pending deliveries" value={fmtNum(pending)} unit="WTG" sub={`Current inventory · ${del.map((d) => d.asOf).filter(Boolean).sort().pop() ? fmtDate(del.map((d) => d.asOf!).filter(Boolean).sort().pop()!) : "—"}`} delta={{ ...change(pending, pendingPrev), upIsGood: false, label: `vs end of previous period` }} href={`/output${q({})}#deliveries`} formula="Σ Current Inventory (Active ZV) on the last working day in the period, across the three streams." />
        <KpiCard label="Quality & rework" value={fmtNum(qi)} unit="open QI" sub={`${fmtNum(out.reworkQty)} QI/rework items resolved`} delta={{ ...change(out.reworkQty, outPrev.reworkQty), label: `resolved ${cmpLabel}` }} href={`/output${q({})}#quality`} formula="Open quality issues = Quality Issue (In Asana) column of Active ZV on the last working day. Resolved = Σ Ext_QI Resolved, Int_QI Resolved+Blade swap, ZDT QI Resolved and Data Process_QI-Rework in User Input." />
        <KpiCard label="Tasks in progress" value={fmtNum(tasks.inProgress)} sub={`${tasks.open} open of ${tasks.total}`} href={`/tasks${q({})}`} formula="In-app tasks with status In Progress." />
        <KpiCard label="Overdue tasks" value={fmtNum(tasks.overdue)} tone={tasks.overdue > 0 ? "critical" : "default"} sub="Past due date, not completed" href={`/tasks${q({ view: "overdue" })}`} formula="Tasks whose due date is before today and status is not Completed." />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Output by work category" subtitle={`WTG process-steps per ${v.grain} · ${fmtRange(trendF.from, trendF.to)}`} info="Raw quantities from User Input grouped into work categories. Categories are not comparable in effort; use productivity for that." />
          <CardBody>
            <ColumnChart categories={cats} series={famSeries} label="Output by work category over time" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Attendance today" subtitle={`${active} active people · ${fmtDate(today, true)}`} actions={<Link href={`/attendance${q({ preset: "today" })}`} className="text-[12.5px] font-medium text-accent hover:underline">Details</Link>} />
          <CardBody>
            <SegmentedBar
              label="Attendance today"
              parts={[
                { name: "In office", value: Math.max(0, hc.present - hc.wfh - hc.halfDay * 0.5), color: "var(--s1)" },
                { name: "WFH", value: hc.wfh, color: "var(--s3)" },
                { name: "Half day", value: hc.halfDay, color: "var(--s4)" },
                { name: "On leave", value: hc.onLeave - hc.halfDay > 0 ? hc.onLeave - hc.halfDay : 0, color: "var(--s2)" },
                { name: "Absent", value: hc.absent, color: "var(--s8)" },
                { name: "Week off / holiday", value: hc.weekOff + hc.holiday, color: "var(--axis)" },
              ]}
              format={(n) => fmtNum(n, 1)}
            />
            <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-xl bg-surface-2 p-3">
                <dt className="text-ink-2">No output logged yesterday</dt>
                <dd className="mt-0.5 text-[18px] font-semibold text-ink">{headcount(ds, prevDay, scope).noOutputLogged}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <dt className="text-ink-2">Present yesterday</dt>
                <dd className="mt-0.5 text-[18px] font-semibold text-ink">{fmtNum(hcPrev.present, 1)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Team productivity trend" subtitle={`Target-days earned ÷ present days, per ${v.grain}`} info="100% means the team delivered one full day of target work for every present day. Days without attendance show no point." />
          <CardBody>
            <LineTrend categories={cats} series={prodSeries} label="Team productivity trend" yName="%" refLine={{ value: 100, name: "Target 100%" }} area />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Needs attention" subtitle="Open critical and warning alerts" actions={<Link href="/alerts" className="text-[12.5px] font-medium text-accent hover:underline">All alerts</Link>} />
          <CardBody>
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl bg-good-soft px-3 py-3 text-[13px] text-good">
                <Info size={15} aria-hidden /> Nothing needs attention right now.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {attention.map((a) => (
                  <li key={a.key} className="flex items-start gap-2.5 rounded-xl border border-line p-2.5">
                    <AlertTriangle size={15} className={a.severity === "critical" ? "mt-0.5 shrink-0 text-critical" : "mt-0.5 shrink-0 text-serious"} aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{a.title}</p>
                      <p className="truncate text-[12px] text-ink-2">{a.message}</p>
                    </div>
                    <Badge tone={a.severity === "critical" ? "critical" : "warning"} className="ml-auto">
                      {a.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card id="deliveries">
          <CardHeader title="Delivery status by stream" subtitle={`Active ZV · ${fmtRange(v.from, v.to)}`} actions={<Link href={`/output${q({})}#deliveries`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">Open <ArrowRight size={13} /></Link>} />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-ink-2">
                    <th className="pb-2 font-medium">Stream</th>
                    <th className="pb-2 text-right font-medium">Delivered</th>
                    <th className="pb-2 text-right font-medium">Uploaded</th>
                    <th className="pb-2 text-right font-medium">Pending</th>
                    <th className="pb-2 text-right font-medium">Open QI</th>
                    <th className="pb-2 text-right font-medium">Delivery rate</th>
                  </tr>
                </thead>
                <tbody>
                  {del.map((s) => (
                    <tr key={s.stream} className="border-t border-line">
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2 font-medium text-ink">
                          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: STREAM_COLOR[s.stream] }} aria-hidden />
                          {s.stream}
                        </span>
                      </td>
                      <td className="tnum py-2.5 text-right">{fmtNum(s.delivered)}</td>
                      <td className="tnum py-2.5 text-right">{fmtNum(s.uploaded)}</td>
                      <td className="tnum py-2.5 text-right">{fmtNum(s.inventory)}</td>
                      <td className="tnum py-2.5 text-right">{fmtNum(s.qualityIssues)}</td>
                      <td className="tnum py-2.5 text-right">{fmtPct(s.deliveryRatePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-muted">Delivery rate = delivered ÷ (delivered + pending at period end).</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Who is meeting target" subtitle={`Ranked by productivity · ${fmtRange(v.from, v.to)}`} info={`Only people with ≥ 70% of their output in targeted processes and ≥ 5 present days are ranked, so untargeted work does not distort the comparison.`} actions={<Link href={`/employees${q({})}`} className="text-[12.5px] font-medium text-accent hover:underline">All employees</Link>} />
          <CardBody>
            {perf.length === 0 ? (
              <Empty title="Not enough data to rank">Pick a longer period (at least 5 present days).</Empty>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { t: "Highest", rows: perf.slice(0, 5) },
                  { t: "Lowest", rows: perf.slice(-5).reverse() },
                ].map((g) => (
                  <div key={g.t}>
                    <p className="mb-1.5 text-[12px] font-medium text-ink-2">{g.t}</p>
                    <ul className="flex flex-col">
                      {g.rows.map((p) => (
                        <li key={p.employee.key} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-[13px] last:border-0">
                          <Link href={`/employees/${encodeURIComponent(p.employee.key)}${q({ employee: null })}`} className="truncate font-medium text-ink hover:text-accent">
                            <span className="tnum mr-1.5 text-muted">#{p.rank}</span>
                            {p.employee.name}
                          </Link>
                          <Badge tone={(p.productivityPct ?? 0) >= 100 ? "good" : (p.productivityPct ?? 0) >= 80 ? "neutral" : "critical"}>{fmtPct(p.productivityPct)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
