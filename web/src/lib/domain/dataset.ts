import "server-only";
import { desc, inArray } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "../db";
import { todayIST } from "../config";
import { buildDataset, RANKING_RULES, type Dataset, type Task } from "./metrics";
import { getProcessTargets, getSettings } from "./settings";
import { getDataMode, getDataVersion } from "../entry/store";
import type { CalendarDay, DayCategory, Stream } from "../types";

type Cached = { runId: number | null; version: number; mode: "sheets" | "app"; today: string; base: Omit<Parameters<typeof buildDataset>[0], "tasks" | "today"> };
const g = globalThis as unknown as { __windData?: Cached; __windLoading?: Promise<Cached> };

async function latestGoodRunId(): Promise<number | null> {
  const db = await getDb();
  const [r] = await db
    .select({ id: schema.syncRuns.id })
    .from(schema.syncRuns)
    .where(inArray(schema.syncRuns.status, ["success", "partial"]))
    .orderBy(desc(schema.syncRuns.id))
    .limit(1);
  return r?.id ?? null;
}

/**
 * In data mode "app", Delivered per stream is calculated from logged FQC output, the same way the
 * old Active ZV sheet did (checked on 2 Jan 2026: External = Ext_FQC; Internal = Int_FQC;
 * ZDT = ZDT FQC + ZDT QI Resolved). A lead can still type a delivered figure (deliveredManual).
 */
export const DELIVERED_FROM: Record<Stream, string[]> = {
  External: ["Ext_FQC"],
  Internal: ["Int_FQC"],
  ZDT: ["ZDT FQC", "ZDT Pitch Beraring FQC", "ZDT QI Resolved"],
};

async function loadBase(runId: number | null, version: number, mode: "sheets" | "app", today: string): Promise<Cached> {
  const db = await withDbTimeout(getDb(), "connecting");
  const [employees, subs, cal, leave, delivery, targets, overtime, refs] = await withDbTimeout(Promise.all([
    db.select().from(schema.employees),
    db.select().from(schema.outputSubmissions),
    db.select().from(schema.calendarDays),
    db.select().from(schema.leaveRequests),
    db.select().from(schema.deliveryDaily),
    db.select().from(schema.targets),
    db.select().from(schema.overtimeEntries),
    db.select().from(schema.referenceValues),
  ]), "loading dashboard data", 60_000);
  let deliveryRows = delivery.map(({ hash: _h, ...d }) => ({ ...d, stream: d.stream as Stream }));
  if (mode === "app") {
    const sums = new Map<string, number>();
    for (const sub of subs)
      for (const [stream, cols] of Object.entries(DELIVERED_FROM))
        for (const c of cols) if (sub.entries[c]) sums.set(`${stream}|${sub.date}`, (sums.get(`${stream}|${sub.date}`) ?? 0) + sub.entries[c]);
    deliveryRows = deliveryRows.map((d) => (d.deliveredManual ? d : { ...d, delivered: Math.round((sums.get(`${d.stream}|${d.date}`) ?? 0) * 100) / 100 }));
    // Days with FQC output but no inventory row yet still count as delivered.
    const have = new Set(deliveryRows.map((d) => `${d.stream}|${d.date}`));
    for (const [k, v] of sums) {
      if (have.has(k)) continue;
      const [stream, date] = k.split("|");
      deliveryRows.push({ stream: stream as Stream, date, delivered: Math.round(v * 100) / 100, expected: 0, uploaded: 0, inventory: 0, qualityIssues: 0, duplicates: 0, lateUploads: 0, auditCount: 0, deliveredManual: false, enteredBy: null, updatedAt: null });
    }
  }
  return {
    runId,
    version,
    mode,
    today,
    base: {
      employees: employees.map(({ hash: _h, ...e }) => e),
      submissions: subs.map(({ hash: _h, ...s }) => s),
      calendar: cal.map(({ hash: _h, ...c }) => ({ ...c, category: c.category as DayCategory, presence: c.presence })) as CalendarDay[],
      leave: leave.map(({ hash: _h, ...l }) => l),
      delivery: deliveryRows,
      targets: targets.map(({ hash: _h, ...t }) => t),
      // Pending / declined OT is not counted anywhere.
      overtime: overtime.filter((o) => o.status === "Approved").map(({ hash: _h, ...o }) => o),
      references: refs.map(({ key, value }) => ({ key, value })),
    },
  };
}

export async function loadTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.tasks).orderBy(desc(schema.tasks.id));
  return rows.map((t) => ({ ...t, dependsOn: t.dependsOn ?? [] }));
}

/**
 * The whole normalised dataset, cached in memory until a newer successful sync exists.
 * Tasks (edited in the app) are always read fresh.
 */
export async function getDataset(): Promise<Dataset> {
  const today = todayIST();
  const [runId, version, mode] = await withDbTimeout(Promise.all([latestGoodRunId(), getDataVersion(), getDataMode()]), "reading the sync status");
  let c = g.__windData;
  if (!c || c.runId !== runId || c.version !== version || c.mode !== mode || c.today !== today) {
    if (!g.__windLoading) g.__windLoading = loadBase(runId, version, mode, today).finally(() => (g.__windLoading = undefined));
    c = g.__windData = await g.__windLoading;
  }
  const [tasks, settings, pt] = await withDbTimeout(Promise.all([loadTasks(), getSettings(), getProcessTargets()]), "loading tasks and settings");
  RANKING_RULES.minCoveragePct = settings.ranking.minCoveragePct;
  RANKING_RULES.minPresentDays = settings.ranking.minPresentDays;
  return buildDataset({ ...c.base, today, tasks, appTargets: pt.targets });
}

export function invalidateDataset() {
  g.__windData = undefined;
}
