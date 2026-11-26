import "server-only";
import { asc, desc, gte } from "drizzle-orm";
import { getDb, schema } from "../db";
import { addDays } from "./dates";
import { TRACKERS, isDone, type Tracker } from "../pipeline";

export interface StageView {
  id: string;
  label: string;
  count: number;
  prev: number | null;
}

export interface TrackerView {
  tracker: Tracker;
  /** Day of the latest count (counts carry forward until the next one). */
  asOf: string | null;
  prevDate: string | null;
  /** WTGs (QIs, items) currently in the tracker: the sum of its stages. */
  total: number;
  prevTotal: number | null;
  stages: StageView[];
  /** Total per counted day, oldest first. */
  series: { date: string; total: number }[];
  updatedBy: string | null;
  updatedAt: string | null;
}

type Row = typeof schema.pipelineCounts.$inferSelect;

/** Pure: build the per-tracker view from count rows (any order). */
export function buildPipeline(rows: Row[], today: string): TrackerView[] {
  return TRACKERS.map((t) => {
    const mine = rows.filter((r) => r.tracker === t.id && r.date <= today);
    const dates = [...new Set(mine.map((r) => r.date))].sort();
    const asOf = dates.at(-1) ?? null;
    const prevDate = dates.at(-2) ?? null;
    const at = (d: string | null) => new Map(mine.filter((r) => r.date === d).map((r) => [r.stage, r]));
    const cur = at(asOf);
    const prev = at(prevDate);
    const stages = t.stages.map((s) => ({ id: s.id, label: s.label, count: cur.get(s.id)?.count ?? 0, prev: prevDate ? (prev.get(s.id)?.count ?? 0) : null }));
    const byDate = new Map<string, number>();
    for (const r of mine) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.count);
    const latest = [...cur.values()].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
    return {
      tracker: t,
      asOf,
      prevDate,
      total: stages.reduce((a, s) => a + s.count, 0),
      prevTotal: prevDate ? stages.reduce((a, s) => a + (s.prev ?? 0), 0) : null,
      stages,
      series: dates.map((d) => ({ date: d, total: byDate.get(d)! })),
      updatedBy: latest?.updatedBy ?? null,
      updatedAt: latest?.updatedAt ?? null,
    };
  });
}

export async function pipelineView(today: string, days = 60) {
  const db = await getDb();
  const rows = await db.select().from(schema.pipelineCounts).where(gte(schema.pipelineCounts.date, addDays(today, -days))).orderBy(asc(schema.pipelineCounts.date));
  return buildPipeline(rows, today);
}

/** Counts saved for a day, or else the latest earlier day per tracker (used to prefill entry). */
export async function countsForEntry(date: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.pipelineCounts).where(gte(schema.pipelineCounts.date, addDays(date, -45)));
  const out: Record<string, { from: string | null; counts: Record<string, number> }> = {};
  for (const t of TRACKERS) {
    const mine = rows.filter((r) => r.tracker === t.id && r.date <= date);
    const from = [...new Set(mine.map((r) => r.date))].sort().at(-1) ?? null;
    out[t.id] = { from, counts: Object.fromEntries(mine.filter((r) => r.date === from).map((r) => [r.stage, r.count])) };
  }
  return out;
}

export async function prioritySites() {
  const db = await getDb();
  const rows = await db.select().from(schema.prioritySites).orderBy(asc(schema.prioritySites.sortOrder), desc(schema.prioritySites.updatedAt));
  // open sites first, then by ETD
  return rows.sort((a, b) => Number(isDone(a.status)) - Number(isDone(b.status)) || (a.etd ?? "9999").localeCompare(b.etd ?? "9999") || a.sortOrder - b.sortOrder);
}
