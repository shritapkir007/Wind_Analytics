import "server-only";
import { desc, inArray } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "../db";
import { todayIST } from "../config";
import { buildDataset, RANKING_RULES, type Dataset, type Task } from "./metrics";
import { getSettings } from "./settings";
import type { CalendarDay, DayCategory, Stream } from "../types";

type Cached = { runId: number | null; today: string; base: Omit<Parameters<typeof buildDataset>[0], "tasks" | "today"> };
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

async function loadBase(runId: number | null, today: string): Promise<Cached> {
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
  return {
    runId,
    today,
    base: {
      employees: employees.map(({ hash: _h, ...e }) => e),
      submissions: subs.map(({ hash: _h, ...s }) => s),
      calendar: cal.map(({ hash: _h, ...c }) => ({ ...c, category: c.category as DayCategory, presence: c.presence })) as CalendarDay[],
      leave: leave.map(({ hash: _h, ...l }) => l),
      delivery: delivery.map(({ hash: _h, ...d }) => ({ ...d, stream: d.stream as Stream })),
      targets: targets.map(({ hash: _h, ...t }) => t),
      overtime: overtime.map(({ hash: _h, ...o }) => o),
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
  const runId = await withDbTimeout(latestGoodRunId(), "reading the sync status");
  let c = g.__windData;
  if (!c || c.runId !== runId || c.today !== today) {
    if (!g.__windLoading) g.__windLoading = loadBase(runId, today).finally(() => (g.__windLoading = undefined));
    c = g.__windData = await g.__windLoading;
  }
  const [tasks, settings] = await withDbTimeout(Promise.all([loadTasks(), getSettings()]), "loading tasks and settings");
  RANKING_RULES.minCoveragePct = settings.ranking.minCoveragePct;
  RANKING_RULES.minPresentDays = settings.ranking.minPresentDays;
  return buildDataset({ ...c.base, today, tasks });
}

export function invalidateDataset() {
  g.__windData = undefined;
}
