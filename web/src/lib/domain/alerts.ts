import "server-only";
import { and, count, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { nowIso } from "../config";
import { getDataset } from "./dataset";
import { getSettings, type AppSettings } from "./settings";
import { addDays, eachDay, fmtDate, weekStart } from "./dates";
import { dayStatus, deliverySummary, employeePerformance, isOverdue, previousWorkingDay, type Dataset } from "./metrics";
import { dispatchNotifications } from "../notify";

export interface AlertDraft {
  key: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  subjectType: "employee" | "stream" | "task" | "sync" | "data";
  subjectId: string | null;
  title: string;
  message: string;
  date: string;
}

const pct = (n: number) => `${Math.round(n)}%`;

export function computeAlerts(ds: Dataset, s: AppSettings, sync: { status: string | null; errorIssues: number; error: string | null }): AlertDraft[] {
  const out: AlertDraft[] = [];
  const t = s.thresholds;
  const on = (k: string) => s.enabledAlerts[k] !== false;
  const today = ds.today;

  if (on("on_leave_today") || on("unplanned_absence")) {
    for (const r of dayStatus(ds, today)) {
      if (on("unplanned_absence") && (r.status === "absent" || (r.status === "half_leave" && r.unplanned))) {
        out.push({ key: `unplanned_absence|${r.employee.key}|${today}`, kind: "unplanned_absence", severity: "warning", subjectType: "employee", subjectId: r.employee.key, date: today, title: `${r.employee.name} — unplanned absence`, message: r.day?.category === "lop" ? "Marked LoP in Calendar View" : `Approved unplanned ${r.leaveType ?? "leave"} today` });
      } else if (on("on_leave_today") && (r.status === "leave" || r.status === "half_leave")) {
        out.push({ key: `on_leave_today|${r.employee.key}|${today}`, kind: "on_leave_today", severity: "info", subjectType: "employee", subjectId: r.employee.key, date: today, title: `${r.employee.name} — on leave`, message: `${r.day?.rawCode} today` });
      }
    }
  }

  const lwd = previousWorkingDay(ds, today);
  if (lwd && on("low_daily_output")) {
    for (const e of ds.employees.filter((x) => x.isActive)) {
      const p = employeePerformance(ds, e.key, { from: lwd, to: lwd });
      if (p.attendance.presentDays <= 0 || p.output.totalSteps === 0) continue;
      if ((p.coveragePct ?? 0) < s.ranking.minCoveragePct || p.productivityPct == null) continue;
      if (p.productivityPct < t.lowDailyProductivityPct)
        out.push({ key: `low_daily_output|${e.key}|${lwd}`, kind: "low_daily_output", severity: "warning", subjectType: "employee", subjectId: e.key, date: lwd, title: `${e.name} — low output on ${fmtDate(lwd)}`, message: `Productivity ${pct(p.productivityPct)} (threshold ${t.lowDailyProductivityPct}%): ${p.output.targetDays.toFixed(2)} target-days in ${p.attendance.presentDays} present day(s)` });
    }
  }

  if (on("missed_weekly_target")) {
    const from = addDays(weekStart(today), -7);
    const to = addDays(from, 6);
    for (const e of ds.employees.filter((x) => x.isActive)) {
      const p = employeePerformance(ds, e.key, { from, to });
      if (p.attendance.presentDays < 2 || (p.coveragePct ?? 0) < s.ranking.minCoveragePct || p.productivityPct == null) continue;
      if (p.productivityPct < t.weeklyTargetPct)
        out.push({ key: `missed_weekly_target|${e.key}|${from}`, kind: "missed_weekly_target", severity: "warning", subjectType: "employee", subjectId: e.key, date: to, title: `${e.name} — missed weekly target`, message: `Week of ${fmtDate(from)}: ${pct(p.productivityPct)} of target (threshold ${t.weeklyTargetPct}%)` });
    }
  }

  if (on("no_output_logged")) {
    const until = addDays(today, -t.noOutputGraceDays);
    const logged = new Set(ds.submissions.map((x) => `${x.employeeKey}|${x.date}`));
    for (const e of ds.employees.filter((x) => x.isActive)) {
      for (const d of eachDay(addDays(today, -7), until)) {
        if (d >= today) continue;
        const c = ds.calendar.get(`${e.key}|${d}`);
        if ((c?.presence ?? 0) > 0 && !logged.has(`${e.key}|${d}`))
          out.push({ key: `no_output_logged|${e.key}|${d}`, kind: "no_output_logged", severity: "info", subjectType: "employee", subjectId: e.key, date: d, title: `${e.name} — no output logged for ${fmtDate(d)}`, message: `Present in Calendar View (${c!.rawCode || "working"}) but no User Input entry` });
      }
    }
  }

  const streams = deliverySummary(ds, { from: today, to: today });
  for (const st of streams) {
    if (!st.asOf) continue;
    if (on("quality_issues_high") && st.qualityIssues > t.qualityIssuesMax)
      out.push({ key: `quality_issues_high|${st.stream}|${st.asOf}`, kind: "quality_issues_high", severity: "warning", subjectType: "stream", subjectId: st.stream, date: st.asOf, title: `${st.stream} — ${st.qualityIssues} open quality issues`, message: `Above the threshold of ${t.qualityIssuesMax} (Active ZV, ${fmtDate(st.asOf)})` });
    if (on("inventory_rising")) {
      const rows = ds.delivery.filter((d) => d.stream === st.stream && d.date <= st.asOf! && (d.inventory > 0 || d.uploaded > 0 || d.delivered > 0));
      const base = rows[rows.length - 1 - t.inventoryRiseDays];
      if (base && base.inventory > 0) {
        const rise = ((st.inventory - base.inventory) / base.inventory) * 100;
        if (rise > t.inventoryRisePct)
          out.push({ key: `inventory_rising|${st.stream}|${st.asOf}`, kind: "inventory_rising", severity: rise > 2 * t.inventoryRisePct ? "critical" : "warning", subjectType: "stream", subjectId: st.stream, date: st.asOf, title: `${st.stream} inventory up ${pct(rise)}`, message: `${base.inventory} on ${fmtDate(base.date)} → ${st.inventory} on ${fmtDate(st.asOf)} (pending deliveries)` });
      }
    }
  }

  if (on("overdue_task")) {
    for (const task of ds.tasks.filter((x) => isOverdue(x, today))) {
      const who = task.assigneeKey ? ds.emp.get(task.assigneeKey)?.name ?? task.assigneeKey : "Unassigned";
      out.push({ key: `overdue_task|${task.id}`, kind: "overdue_task", severity: task.priority === "Critical" || task.priority === "High" ? "critical" : "warning", subjectType: "task", subjectId: String(task.id), date: task.dueOn!, title: `Overdue: ${task.title}`, message: `${who} · due ${fmtDate(task.dueOn!)} · ${task.status}` });
    }
  }

  if (on("sync_failed") && (sync.status === "failed" || sync.status === "partial"))
    out.push({ key: `sync_failed|latest`, kind: "sync_failed", severity: sync.status === "failed" ? "critical" : "warning", subjectType: "sync", subjectId: null, date: today, title: sync.status === "failed" ? "Data sync failed" : "Data sync partially failed", message: sync.error ?? "See Data Sources for details" });
  if (on("data_quality") && sync.errorIssues > 0)
    out.push({ key: `data_quality|latest`, kind: "data_quality", severity: "warning", subjectType: "data", subjectId: null, date: today, title: `${sync.errorIssues} data-quality error(s)`, message: "Rows were skipped or not counted. Review them in Data Sources." });

  return out;
}

export async function refreshAlerts() {
  const db = await getDb();
  const [ds, settings] = await Promise.all([getDataset(), getSettings()]);
  const [last] = await db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(1);
  let errorIssues = 0;
  if (last) {
    const [c] = await db.select({ n: count() }).from(schema.syncIssues).where(and(eq(schema.syncIssues.runId, last.id), eq(schema.syncIssues.severity, "error")));
    errorIssues = Number(c?.n ?? 0);
  }
  const drafts = computeAlerts(ds, settings, { status: last?.status ?? null, errorIssues, error: last?.error ?? null });
  const now = nowIso();
  const existing = new Map((await db.select().from(schema.alerts)).map((a) => [a.key, a]));
  const fresh: AlertDraft[] = [];
  for (let i = 0; i < drafts.length; i += 500) {
    const chunk = drafts.slice(i, i + 500);
    for (const d of chunk) if (!existing.has(d.key) || existing.get(d.key)!.resolvedAt) fresh.push(d);
    await db
      .insert(schema.alerts)
      .values(chunk.map((d) => ({ ...d, firstSeen: now, lastSeen: now })))
      .onConflictDoUpdate({
        target: schema.alerts.key,
        set: { title: sql.raw(`excluded."title"`), message: sql.raw(`excluded."message"`), severity: sql.raw(`excluded."severity"`), lastSeen: now, resolvedAt: null },
      });
  }
  const keys = drafts.map((d) => d.key);
  await db
    .update(schema.alerts)
    .set({ resolvedAt: now })
    .where(keys.length ? and(isNull(schema.alerts.resolvedAt), notInArray(schema.alerts.key, keys)) : isNull(schema.alerts.resolvedAt));
  if (fresh.length) await dispatchNotifications(fresh, settings);
  return { active: drafts.length, new: fresh.length };
}
