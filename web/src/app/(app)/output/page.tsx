import { loadPage } from "@/lib/page";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CardBody, CardHeader, Empty, KpiCard, PageHeader, Swatch } from "@/components/ui";
import { BarRank, ColumnChart, LineTrend } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import {
  change,
  comparisonPeriod,
  deliverySeries,
  deliverySummary,
  outputSeries,
  outputSummary,
  processTargets,
  submissionsInScope,
  teamPerformance,
  teamTotals,
} from "@/lib/domain/metrics";
import { addDays, diffDays, fmtDate, fmtMonth, fmtRange } from "@/lib/domain/dates";
import { FAMILIES } from "@/lib/processes";
import { FAMILY_COLOR, fmtNum, fmtPct, qs, STREAM_COLOR, type SP } from "@/lib/view";
import type { Stream } from "@/lib/types";

export const dynamic = "force-dynamic";

const NOTE_FLAGS: [RegExp, string][] = [
  [/re-?shoot/i, "Reshoot"],
  [/on\s*hold|\bhold\b/i, "On hold"],
  [/re-?work/i, "Rework"],
  [/\bQI\b|quality/i, "QI"],
  [/reject/i, "Rejected"],
];

export default async function Output({ searchParams }: { searchParams: Promise<SP> }) {
  const { ds, sp, v, filter, barProps } = await loadPage(searchParams);
  const cmp = comparisonPeriod(ds, filter);
  const out = outputSummary(ds, filter);
  const outPrev = outputSummary(ds, { ...filter, ...cmp });
  const totals = teamTotals(ds, filter);
  const totalsPrev = teamTotals(ds, { ...filter, ...cmp });
  const del = deliverySummary(ds, filter);
  const delPrev = deliverySummary(ds, cmp);
  const sum = (a: typeof del, k: "delivered" | "uploaded" | "inventory" | "qualityIssues" | "duplicates" | "lateUploads") => a.reduce((s, x) => s + x[k], 0);
  const targets = processTargets(ds, filter);
  const perf = teamPerformance(ds, filter).filter((p) => p.output.totalSteps > 0);

  const trendF = diffDays(v.from, v.to) < 13 ? { ...filter, from: addDays(v.to, -29) } : filter;
  const series = outputSeries(ds, trendF, v.grain);
  const cat = (b: string) => (v.grain === "month" ? fmtMonth(b) : fmtDate(b));
  const famSeries = FAMILIES.filter((f) => series.some((p) => (p.tdByFamily[f] ?? 0) > 0)).map((f) => ({ name: f, color: FAMILY_COLOR[f], stack: "o", data: series.map((p) => Math.round((p.tdByFamily[f] ?? 0) * 100) / 100) }));

  const dF = diffDays(v.from, v.to) < 13 ? { from: addDays(v.to, -29), to: v.to } : { from: v.from, to: v.to };
  const dSeries = deliverySeries(ds, dF, v.grain);
  const dCats = dSeries.map((p) => cat(p.bucket));
  const streams: Stream[] = ["External", "Internal", "ZDT"];

  // Pending delivery aging proxy: inventory ÷ average delivered per working day (last 10 working days).
  const clearDays = streams.map((st) => {
    const rows = ds.delivery.filter((d) => d.stream === st && d.date <= v.to && d.delivered > 0).slice(-10);
    const avg = rows.length ? rows.reduce((a, d) => a + d.delivered, 0) / rows.length : 0;
    const inv = del.find((d) => d.stream === st)!.inventory;
    return { st, avg, inv, days: avg > 0 ? inv / avg : null };
  });

  // Free-text mentions (Other_Work / Team Lead's Notes)
  const subs = submissionsInScope(ds, filter);
  const notes = subs
    .flatMap((s) => [s.otherWork, s.leadNote].filter(Boolean).map((t) => ({ s, t: t! })))
    .map(({ s, t }) => ({ s, t, flags: NOTE_FLAGS.filter(([re]) => re.test(t)).map(([, l]) => l) }));
  const flagged = notes.filter((n) => n.flags.length);
  const flagCounts = Object.fromEntries(NOTE_FLAGS.map(([, l]) => [l, flagged.filter((n) => n.flags.includes(l)).length]));

  const q = (o: Record<string, string | null> = {}) => qs(sp, o);
  const procRows = Object.entries(out.byProcess).sort((a, b) => b[1] - a[1]);
  const topPerf = [...perf].sort((a, b) => b.output.targetDays - a.output.targetDays).slice(0, 20);

  return (
    <div className="fade-in">
      <PageHeader title="Output & deliveries" subtitle={<>User Input (per person, per process) and Active ZV (per stream) · {fmtRange(v.from, v.to)}</>} />
      <FilterBar {...barProps} families={FAMILIES} showFamily showGrain />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Entries logged" value={fmtNum(out.submissions)} sub={`${out.people} people`} delta={{ ...change(out.submissions, outPrev.submissions), label: `vs ${fmtRange(cmp.from, cmp.to)}` }} formula="Daily output entries (one per person per day). Quantities are shown per process below and are never added across processes." />
        <KpiCard label="Target-days earned" value={fmtNum(out.targetDays, 1)} sub="Each process ÷ its own target" delta={{ ...change(out.targetDays, outPrev.targetDays), label: "vs previous period" }} formula="Σ quantity ÷ that process's target per day (upper end of its range in Settings), for processes counted in productivity." />
        <KpiCard label="Team productivity" value={fmtPct(totals.productivityPct)} sub={`${fmtNum(totals.presentDays, 1)} present days`} delta={{ ...change(totals.productivityPct, totalsPrev.productivityPct), label: "vs previous period", suffix: " pts" }} tone={totals.productivityPct != null && totals.productivityPct < 80 ? "warning" : "default"} formula="Target-days earned ÷ present days (Calendar View)." />
        <KpiCard label="Target vs actual" value={fmtPct(totals.targetAchievementPct)} sub={`${fmtNum(totals.targetQtyActual)} of ${fmtNum(totals.targetQtyExpected)} expected`} href="#targets" />
        <KpiCard label="Delivered" value={fmtNum(sum(del, "delivered"))} unit="WTG" sub="Active ZV" delta={{ ...change(sum(del, "delivered"), sum(delPrev, "delivered")), label: "vs previous period" }} href="#deliveries" />
        <KpiCard label="Uploaded" value={fmtNum(sum(del, "uploaded"))} unit="WTG" sub="New work received" delta={{ ...change(sum(del, "uploaded"), sum(delPrev, "uploaded")), label: "vs previous period" }} href="#deliveries" />
        <KpiCard label="Pending (inventory)" value={fmtNum(sum(del, "inventory"))} unit="WTG" sub={`≈ ${fmtNum(clearDays.reduce((a, c) => a + c.inv, 0) / Math.max(1e-9, clearDays.reduce((a, c) => a + c.avg, 0)), 1)} working days to clear`} delta={{ ...change(sum(del, "inventory"), sum(delPrev, "inventory")), upIsGood: false, label: "vs end of previous period" }} href="#deliveries" formula="Current Inventory on the last working day. Days to clear = inventory ÷ average delivered per working day over the last 10 working days (an estimate; the sheets have no per-WTG dates)." />
        <KpiCard label="Open quality issues" value={fmtNum(sum(del, "qualityIssues"))} sub={`${fmtNum(out.reworkQty)} QI/rework resolved · ${fmtNum(sum(del, "duplicates"))} duplicates`} href="#quality" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Output trend by work category" subtitle={`Target-days per ${v.grain} · ${fmtRange(trendF.from, trendF.to)} (each process ÷ its own target)`} />
          <CardBody>
            <ColumnChart categories={series.map((p) => cat(p.bucket))} series={famSeries} label="Output trend by work category" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Productivity trend" subtitle={`Target-days ÷ present days per ${v.grain}`} />
          <CardBody>
            <LineTrend categories={series.map((p) => cat(p.bucket))} series={[{ name: "Productivity", color: "var(--s1)", data: series.map((p) => (p.productivityPct == null ? null : Math.round(p.productivityPct))) }]} yName="%" refLine={{ value: 100, name: "100%" }} label="Productivity trend" area />
          </CardBody>
        </Card>
      </div>

      <Card id="targets" className="mb-4">
        <CardHeader title="Target vs actual by process" subtitle="Targets from Settings → Productivity targets (upper end of each range)" info="Expected = target/day × present days spent on the process. A present day is split across the processes logged that day in proportion to their target-day share. Output on a week-off or leave day adds actual but no expected work." />
        <CardBody>
          {targets.length === 0 ? (
            <Empty title="No targeted output in this period" />
          ) : (
            <DataTable
              searchable={false}
              filename="target-vs-actual"
              initialSort={{ key: "actual", desc: true }}
              columns={[
                { key: "process", header: "Process" },
                { key: "family", header: "Category", hideOnMobile: true },
                { key: "target", header: "Target / day", align: "right" },
                { key: "range", header: "Sheet range", align: "right", hideOnMobile: true },
                { key: "days", header: "Days on process", align: "right" },
                { key: "expected", header: "Expected", align: "right" },
                { key: "actual", header: "Actual", align: "right" },
                { key: "ach", header: "Achievement", align: "right" },
              ]}
              rows={targets.map((r) => ({
                process: r.label,
                family: r.family,
                target: r.target.perDay,
                range: r.target.range || "—",
                days: Math.round(r.allocatedDays * 10) / 10,
                expected: Math.round(r.expectedQty * 10) / 10,
                actual: Math.round(r.actualQty * 100) / 100,
                ach: { v: r.achievementPct, label: fmtPct(r.achievementPct), badge: true, tone: r.achievementPct == null ? "muted" : r.achievementPct >= 100 ? "good" : r.achievementPct >= 80 ? "warning" : "critical" },
              }))}
            />
          )}
        </CardBody>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Employee-wise output" subtitle="Top 20 by target-days earned (comparable across processes)" />
          <CardBody>
            {topPerf.length ? (
              <BarRank labels={topPerf.map((p) => p.employee.name)} values={topPerf.map((p) => Math.round(p.output.targetDays * 10) / 10)} label="Target-days earned per employee" color="var(--s1)" />
            ) : (
              <Empty title="No output in this period" />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Process breakdown" subtitle="Raw quantities, with the target used for each" />
          <CardBody>
            <ul className="flex flex-col">
              {procRows.map(([p, n]) => {
                const info = ds.processes.get(p)!;
                return (
                  <li key={p} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Swatch color={FAMILY_COLOR[info.family]} />
                      <span className="truncate text-ink">{info.label}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      {info.counts ? <Badge tone="good">Target {info.target.perDay}/day</Badge> : info.inProductivity ? <Badge tone="warning">Target missing</Badge> : <Badge>No target</Badge>}
                      <span className="tnum w-16 text-right font-medium text-ink">{fmtNum(n)}</span>
                    </span>
                  </li>
                );
              })}
              {procRows.length === 0 && <Empty title="No output in this period" />}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div id="deliveries" className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Delivered per stream" subtitle={`Active ZV · Delivered/Day per ${v.grain}`} />
          <CardBody>
            <ColumnChart categories={dCats} series={streams.map((st) => ({ name: st, color: STREAM_COLOR[st], stack: "d", data: dSeries.map((p) => Math.round((p[`${st}.delivered`] ?? 0) * 100) / 100) }))} label="Delivered per stream" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pending inventory per stream" subtitle="Current Inventory on the last working day of each bucket" />
          <CardBody>
            <LineTrend categories={dCats} series={streams.map((st) => ({ name: st, color: STREAM_COLOR[st], data: dSeries.map((p) => p[`${st}.inventory`] ?? null) }))} label="Pending inventory per stream" />
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title="Delivery status & pending aging" subtitle={fmtRange(v.from, v.to)} info="The sheets record inventory as daily counts, not individual WTGs, so true per-WTG aging is not available. 'Days to clear' estimates how long the current inventory lasts at the recent delivery pace." />
        <CardBody>
          <DataTable
            searchable={false}
            filename="delivery-status"
            columns={[
              { key: "st", header: "Stream" },
              { key: "del", header: "Delivered", align: "right" },
              { key: "up", header: "Uploaded", align: "right" },
              { key: "inv", header: "Pending", align: "right" },
              { key: "pace", header: "Avg delivered / day", align: "right", hideOnMobile: true },
              { key: "clear", header: "Days to clear", align: "right" },
              { key: "qi", header: "Open QI", align: "right" },
              { key: "dup", header: "Duplicates", align: "right", hideOnMobile: true },
              { key: "late", header: "Late uploads", align: "right", hideOnMobile: true },
              { key: "audit", header: "Audit count", align: "right", hideOnMobile: true },
              { key: "asof", header: "As of", hideOnMobile: true },
            ]}
            rows={del.map((d, i) => ({
              st: d.stream,
              del: d.delivered,
              up: d.uploaded,
              inv: d.inventory,
              pace: Math.round(clearDays[i].avg * 10) / 10,
              clear: { v: clearDays[i].days, label: clearDays[i].days == null ? "—" : fmtNum(clearDays[i].days, 1), tone: (clearDays[i].days ?? 0) > 5 ? "critical" : undefined },
              qi: d.qualityIssues,
              dup: d.duplicates,
              late: d.lateUploads,
              audit: d.auditCount,
              asof: d.asOf ? fmtDate(d.asOf, true) : "—",
            }))}
          />
        </CardBody>
      </Card>

      <div id="quality" className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Open quality issues per stream" subtitle="Active ZV · Quality Issue (In Asana)" />
          <CardBody>
            <LineTrend categories={dCats} series={streams.map((st) => ({ name: st, color: STREAM_COLOR[st], data: dSeries.map((p) => p[`${st}.qualityIssues`] ?? null) }))} label="Open quality issues per stream" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="On hold, reshoot & rework mentions" subtitle="Found in Other_Work and Team Lead's Notes" info="The sheets have no status column for individual WTGs, so On Hold / Reshoot / Rejected cannot be tracked per WTG. These are free-text mentions; counts are mentions, not WTGs." />
          <CardBody>
            <div className="mb-3 flex flex-wrap gap-2">
              {NOTE_FLAGS.map(([, l]) => (
                <Badge key={l} tone={flagCounts[l] ? "warning" : "neutral"}>
                  {l}: {flagCounts[l]}
                </Badge>
              ))}
              <Badge tone="accent">Rework/QI resolved (numeric): {fmtNum(out.reworkQty)}</Badge>
            </div>
            <DataTable
              pageSize={6}
              dense
              filename="note-mentions"
              initialSort={{ key: "date", desc: true }}
              columns={[
                { key: "date", header: "Date" },
                { key: "who", header: "Employee" },
                { key: "note", header: "Note" },
                { key: "flags", header: "Flags" },
              ]}
              rows={(flagged.length ? flagged : notes).map((n) => ({
                date: { v: n.s.date, label: fmtDate(n.s.date, true) },
                who: { v: ds.emp.get(n.s.employeeKey)?.name ?? n.s.employeeKey, href: `/employees/${encodeURIComponent(n.s.employeeKey)}${q({ employee: null })}` },
                note: n.t,
                flags: n.flags.join(", ") || "—",
              }))}
              emptyText="No notes in this period."
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Output log" subtitle="Every User Input entry in the period (one row per person per Output_Date)" info="Traceability: 'Row' is the row number in the User Input tab. Late = submitted more than one day after the Output_Date." />
        <CardBody>
          <DataTable
            filename="output-log"
            initialSort={{ key: "date", desc: true }}
            columns={[
              { key: "date", header: "Output date" },
              { key: "who", header: "Employee" },
              { key: "work", header: "Processes" },
              { key: "td", header: "Target-days", align: "right" },
              { key: "sub", header: "Submitted", hideOnMobile: true },
              { key: "row", header: "Row", align: "right", hideOnMobile: true },
            ]}
            rows={subs.map((s) => {
              let td = 0;
              const parts: string[] = [];
              for (const [p, n] of Object.entries(s.entries)) {
                const info = ds.processes.get(p)!;
                if (v.family && info.family !== v.family) continue;
                if (info.counts) td += n / info.target.perDay!;
                parts.push(`${info.label} ${n}`);
              }
              const late = s.submittedAt && s.submittedAt.slice(0, 10) > addDays(s.date, 1);
              return {
                date: { v: s.date, label: fmtDate(s.date, true) },
                who: { v: ds.emp.get(s.employeeKey)?.name ?? s.employeeKey, href: `/employees/${encodeURIComponent(s.employeeKey)}${q({ employee: null })}` },
                work: parts.join(" · ") || "—",
                td: Math.round(td * 100) / 100,
                sub: { v: s.submittedAt, label: s.submittedAt ? `${fmtDate(s.submittedAt.slice(0, 10))} ${s.submittedAt.slice(11, 16)}${late ? " · late" : ""}` : "—", tone: late ? "warning" : undefined },
                row: { v: s.sourceRow, label: s.sourceRow ? String(s.sourceRow) : "app" },
              };
            })}
          />
        </CardBody>
      </Card>
    </div>
  );
}

