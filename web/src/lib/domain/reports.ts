// Report builder shared by the Reports page and the XLSX / CSV / PDF exports.

import {
  attendanceFor,
  dayStatus,
  deliverySummary,
  employeesInScope,
  headcount,
  isOverdue,
  outputSeries,
  outputSummary,
  processTargets,
  teamPerformance,
  teamTotals,
  type Dataset,
  type Filter,
} from "./metrics";
import { addDays, eachDay, fmtDate, fmtRange, monthEnd, monthStart, previousPeriod, weekStart } from "./dates";

export type ReportKind = "daily" | "weekly" | "monthly" | "custom";

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
  note?: string;
}

export interface Report {
  kind: ReportKind;
  title: string;
  range: { from: string; to: string };
  scope: string;
  generatedAt: string;
  kpis: { label: string; value: string; note?: string }[];
  tables: ReportTable[];
  insights: string[];
}

const r1 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${Math.round(n)}%`);
const signed = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n)}%`);
const delta = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);

export function reportRange(kind: ReportKind, anchor: string, custom?: { from: string; to: string }) {
  if (kind === "daily") return { from: anchor, to: anchor };
  if (kind === "weekly") {
    const s = weekStart(anchor);
    return { from: s, to: addDays(s, 6) };
  }
  if (kind === "monthly") return { from: monthStart(anchor), to: monthEnd(anchor) };
  return custom ?? { from: monthStart(anchor), to: anchor };
}

export function buildReport(ds: Dataset, kind: ReportKind, range: { from: string; to: string }, scope: Pick<Filter, "section" | "employee">): Report {
  const f: Filter = { ...range, ...scope };
  const prev = kind === "daily" ? { from: addDays(range.from, -1), to: addDays(range.to, -1) } : previousPeriod(range.from, range.to);
  const pf: Filter = { ...prev, ...scope };
  const scopeLabel = scope.employee ? ds.emp.get(scope.employee)?.name ?? scope.employee : scope.section ?? "All teams";
  const label = kind === "daily" ? "Daily" : kind === "weekly" ? "Weekly" : kind === "monthly" ? "Monthly" : "Custom";
  const rep: Report = {
    kind,
    title: `${label} operations report · ${fmtRange(range.from, range.to)}`,
    range,
    scope: scopeLabel,
    generatedAt: new Date().toISOString(),
    kpis: [],
    tables: [],
    insights: [],
  };

  const out = outputSummary(ds, f);
  const outP = outputSummary(ds, pf);
  const tot = teamTotals(ds, f);
  const totP = teamTotals(ds, pf);
  const del = deliverySummary(ds, range);
  const perf = teamPerformance(ds, f);
  const emps = employeesInScope(ds, scope);
  const tasks = ds.tasks.filter((t) => (!scope.employee || t.assigneeKey === scope.employee) && (!scope.section || (t.assigneeKey && ds.emp.get(t.assigneeKey)?.section === scope.section)));
  const overdue = tasks.filter((t) => isOverdue(t, ds.today < range.to ? ds.today : range.to));
  const completed = tasks.filter((t) => t.completedOn && t.completedOn >= range.from && t.completedOn <= range.to);
  const name = (k: string) => ds.emp.get(k)?.name ?? k;

  // ---------- KPIs
  if (kind === "daily") {
    const hc = headcount(ds, range.from, scope);
    rep.kpis.push(
      { label: "Active employees", value: String(hc.active) },
      { label: "Present", value: String(r1(hc.present)), note: `${hc.wfh} WFH, ${hc.halfDay} half-day` },
      { label: "On leave", value: String(hc.onLeave) },
      { label: "Absent (LoP)", value: String(hc.absent), note: hc.unplannedLeave ? `${hc.unplannedLeave} on unplanned leave (counted as leave)` : undefined },
      { label: "No output logged", value: String(hc.noOutputLogged) },
    );
  } else {
    let sched = 0;
    let pres = 0;
    let leave = 0;
    for (const e of emps) {
      const a = attendanceFor(ds, e.key, range);
      sched += a.scheduledDays;
      pres += a.presentDays;
      leave += a.leaveDays;
    }
    rep.kpis.push(
      { label: "Attendance rate", value: pct(sched ? (pres / sched) * 100 : null), note: `${r1(pres)} of ${sched} person-days` },
      { label: "Leave days", value: String(r1(leave)) },
    );
  }
  rep.kpis.push(
    { label: "Output (process-steps)", value: String(r2(out.totalSteps)), note: `${signed(delta(out.totalSteps, outP.totalSteps))} vs ${fmtRange(prev.from, prev.to)}` },
    { label: "Team productivity", value: pct(tot.productivityPct), note: `previous ${pct(totP.productivityPct)}` },
    { label: "Target vs actual", value: pct(tot.targetAchievementPct) },
    { label: "Delivered (WTG)", value: String(r2(del.reduce((a, d) => a + d.delivered, 0))) },
    { label: "Pending deliveries (WTG)", value: String(r2(del.reduce((a, d) => a + d.inventory, 0))) },
    { label: "Open quality issues", value: String(del.reduce((a, d) => a + d.qualityIssues, 0)) },
    { label: "Tasks completed", value: String(completed.length) },
    { label: "Overdue tasks", value: String(overdue.length) },
  );

  // ---------- Tables
  if (kind === "daily") {
    const st = dayStatus(ds, range.from, scope);
    rep.tables.push({
      title: "Leave & absence",
      columns: ["Employee", "Team", "Status", "Code"],
      rows: st.filter((r) => ["leave", "half_leave", "absent"].includes(r.status)).map((r) => [r.employee.name, r.employee.section, r.status === "absent" ? "Absent (LoP)" : `${r.status === "half_leave" ? "Half-day leave" : "On leave"}${r.unplanned ? " · unplanned" : ""}`, r.day?.rawCode ?? ""]),
    });
    rep.tables.push({
      title: "Present but no output logged",
      columns: ["Employee", "Team", "Calendar"],
      rows: st.filter((r) => (r.day?.presence ?? 0) > 0 && !r.outputLogged).map((r) => [r.employee.name, r.employee.section, r.day?.rawCode || "Working"]),
    });
  }

  rep.tables.push({
    title: kind === "monthly" ? "Employee ranking" : "Employee-wise output & performance",
    columns: ["Rank", "Employee", "Team", "Present days", "Output (steps)", "Target-days", "Productivity", "Coverage", "Main processes"],
    rows: perf
      .filter((p) => p.output.totalSteps > 0 || p.attendance.presentDays > 0)
      .map((p) => [
        p.rank,
        p.employee.name,
        p.employee.section,
        r1(p.attendance.presentDays),
        r2(p.output.totalSteps),
        r2(p.output.targetDays),
        pct(p.productivityPct),
        pct(p.coveragePct),
        Object.entries(p.output.byProcess).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${ds.processes.get(k)!.label} ${r2(n)}`).join(", "),
      ]),
    note: "Productivity = target-days ÷ present days. Rank only for coverage >= 70% and >= 5 present days.",
  });

  rep.tables.push({
    title: "Output by process",
    columns: ["Process", "Category", "Quantity", "Previous period", "Change", "Target/day", "Target source"],
    rows: Object.entries(out.byProcess)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => {
        const info = ds.processes.get(p)!;
        return [info.label, info.family, r2(n), r2(outP.byProcess[p] ?? 0), signed(delta(n, outP.byProcess[p] ?? 0)), info.target.perDay, info.target.source];
      }),
  });

  if (kind !== "daily") {
    rep.tables.push({
      title: "Target achievement by process",
      columns: ["Process", "Target/day", "Days on process", "Expected", "Actual", "Achievement"],
      rows: processTargets(ds, f).map((r) => [r.label, r.target.perDay, r1(r.allocatedDays), r1(r.expectedQty), r2(r.actualQty), pct(r.achievementPct)]),
    });
    const series = outputSeries(ds, f, kind === "monthly" ? "week" : "day");
    rep.tables.push({
      title: kind === "monthly" ? "Output trend by week" : "Output & attendance by day",
      columns: ["Period", "Output (steps)", "Target-days", "Present days", "Productivity"],
      rows: series.map((s) => [kind === "monthly" ? `Week of ${fmtDate(s.bucket)}` : fmtDate(s.bucket), r2(s.total), r2(s.targetDays), r1(s.presentDays), pct(s.productivityPct)]),
    });
    const sections = [...new Set(emps.map((e) => e.section))];
    rep.tables.push({
      title: "Attendance & leave by team",
      columns: ["Team", "People", "Scheduled days", "Present days", "Attendance", "Leave days", "LoP"],
      rows: sections.map((s) => {
        const a = emps.filter((e) => e.section === s).map((e) => attendanceFor(ds, e.key, range));
        const sc = a.reduce((x, y) => x + y.scheduledDays, 0);
        const pr = a.reduce((x, y) => x + y.presentDays, 0);
        return [s, a.length, sc, r1(pr), pct(sc ? (pr / sc) * 100 : null), r1(a.reduce((x, y) => x + y.leaveDays, 0)), a.reduce((x, y) => x + y.lopDays, 0)];
      }),
    });
  }

  rep.tables.push({
    title: "Delivery performance (Active ZV)",
    columns: ["Stream", "Delivered", "Uploaded", "Pending (end)", "Open QI (end)", "Duplicates", "Late uploads", "Delivery rate"],
    rows: del.map((d) => [d.stream, r2(d.delivered), r2(d.uploaded), r2(d.inventory), d.qualityIssues, d.duplicates, d.lateUploads, pct(d.deliveryRatePct)]),
  });
  if (kind === "monthly" || kind === "custom") {
    rep.tables.push({
      title: "Quality metrics",
      columns: ["Measure", "Value"],
      rows: [
        ["QI / rework items resolved (User Input)", r2(out.reworkQty)],
        ["Open quality issues at period end (Active ZV)", del.reduce((a, d) => a + d.qualityIssues, 0)],
        ["Duplicate turbines (Active ZV)", del.reduce((a, d) => a + d.duplicates, 0)],
        ["Late uploads (Active ZV)", del.reduce((a, d) => a + d.lateUploads, 0)],
        ["Audit count (Active ZV)", del.reduce((a, d) => a + d.auditCount, 0)],
      ],
    });
  }
  rep.tables.push({
    title: "Tasks",
    columns: ["Task ID", "Task", "Assignee", "Priority", "Due", "Status"],
    rows: [...overdue, ...completed.filter((t) => !overdue.includes(t))].map((t) => [`TSK-${String(t.id).padStart(4, "0")}`, t.title, t.assigneeKey ? name(t.assigneeKey) : "Unassigned", t.priority, t.dueOn ?? "", isOverdue(t, ds.today) ? `${t.status} (overdue)` : t.status]),
    note: "Overdue tasks and tasks completed in the period.",
  });

  // ---------- Insights (rule-based, each traceable to a table above)
  const low = perf.filter((p) => p.rank != null && (p.productivityPct ?? 0) < 80);
  if (low.length) rep.insights.push(`${low.length} ranked ${low.length === 1 ? "person is" : "people are"} below 80% productivity: ${low.slice(0, 5).map((p) => `${p.employee.name} (${pct(p.productivityPct)})`).join(", ")}${low.length > 5 ? "…" : ""}.`);
  const weakProc = processTargets(ds, f).filter((r) => r.achievementPct != null && r.achievementPct < 80 && r.allocatedDays >= 3);
  if (weakProc.length) rep.insights.push(`Processes under 80% of target: ${weakProc.map((r) => `${r.label} ${pct(r.achievementPct)}`).join(", ")}.`);
  const noOut = perf.filter((p) => p.noOutputDays >= 2);
  if (noOut.length) rep.insights.push(`${noOut.length} ${noOut.length === 1 ? "person has" : "people have"} 2+ present days without a User Input entry — output may be under-reported: ${noOut.slice(0, 5).map((p) => `${p.employee.name} (${p.noOutputDays})`).join(", ")}.`);
  const missingTarget = [...ds.processes.values()].filter((p) => p.inProductivity && !p.counts && (out.byProcess[p.column] ?? 0) > 0);
  if (missingTarget.length) rep.insights.push(`${missingTarget.map((p) => p.label).join(", ")} ${missingTarget.length === 1 ? "is" : "are"} meant to count toward productivity but ${missingTarget.length === 1 ? "has" : "have"} no row in the Target tab, so ${missingTarget.length === 1 ? "it is" : "they are"} excluded until a target is added.`);
  for (const d of del) {
    const rate = d.deliveryRatePct;
    if (rate != null && rate < 50) rep.insights.push(`${d.stream}: only ${pct(rate)} delivery rate — pending inventory (${r2(d.inventory)}) exceeds what was delivered (${r2(d.delivered)}).`);
  }
  if (overdue.length) rep.insights.push(`${overdue.length} overdue task(s) need follow-up.`);
  const dP = delta(out.totalSteps, outP.totalSteps);
  if (dP != null && Math.abs(dP) >= 10) rep.insights.push(`Output ${dP > 0 ? "rose" : "fell"} ${Math.abs(Math.round(dP))}% compared with ${fmtRange(prev.from, prev.to)}.`);
  if (!rep.insights.length) rep.insights.push("No exceptions found for this period.");

  // Days with no data in range (to warn about partial periods)
  const future = [...eachDay(range.from, range.to)].filter((d) => d > ds.today).length;
  if (future) rep.insights.unshift(`This period includes ${future} future day(s); figures cover data up to ${fmtDate(ds.today, true)}.`);
  return rep;
}
