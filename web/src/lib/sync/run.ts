import "server-only";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema, shortDbError } from "../db";
import { nowIso, todayIST } from "../config";
import { getSource, type SheetSource } from "../sheets/source";
import { collect } from "./collect";
import { reconcile } from "./reconcile";
import { applyDiff, type DiffStats } from "./apply";
import { refreshAlerts } from "../domain/alerts";

export interface SyncResult {
  runId: number;
  status: "success" | "partial" | "failed" | "skipped";
  stats: Record<string, DiffStats & { error?: string }>;
  issues: number;
  error?: string;
}

const KEEP_RUNS_WITH_ISSUES = 20;

export async function runSync(opts: {
  mode: "quick" | "full";
  trigger: "schedule" | "manual" | "startup";
  triggeredBy?: string;
  source?: SheetSource;
}): Promise<SyncResult> {
  const db = await getDb();
  const started = nowIso();

  // Single-flight: skip if another run started in the last 10 minutes and is still running.
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const running = await db
    .select({ id: schema.syncRuns.id })
    .from(schema.syncRuns)
    .where(and(eq(schema.syncRuns.status, "running"), gt(schema.syncRuns.startedAt, tenMinAgo)))
    .limit(1);
  if (running.length) return { runId: running[0].id, status: "skipped", stats: {}, issues: 0, error: "A sync is already running" };
  await db.update(schema.syncRuns).set({ status: "failed", error: "Interrupted", finishedAt: started }).where(eq(schema.syncRuns.status, "running"));

  const [run] = await db
    .insert(schema.syncRuns)
    .values({ mode: opts.mode, trigger: opts.trigger, triggeredBy: opts.triggeredBy ?? null, startedAt: started, status: "running" })
    .returning({ id: schema.syncRuns.id });

  const stats: SyncResult["stats"] = {};
  try {
    const snap = await collect(opts.source ?? getSource(), opts.mode);
    const issues = [...snap.issues, ...reconcile(snap, todayIST())];

    const plan: [string, Parameters<typeof applyDiff>[1], string[], Record<string, unknown>[] | undefined][] = [
      ["employees", schema.employees, ["key"], snap.employees as never],
      ["output", schema.outputSubmissions, ["employeeKey", "date"], snap.submissions as never],
      ["calendar", schema.calendarDays, ["employeeKey", "date"], snap.calendar as never],
      ["leave", schema.leaveRequests, ["workflowId"], snap.leave as never],
      ["delivery", schema.deliveryDaily, ["stream", "date"], snap.delivery as never],
      ["targets", schema.targets, ["key"], snap.targets as never],
      ["overtime", schema.overtimeEntries, ["rowKey"], snap.overtime as never],
    ];
    for (const [name, table, keys, rows] of plan) {
      if (!rows) {
        stats[name] = { read: 0, inserted: 0, updated: 0, deleted: 0, error: "source unavailable — previous data kept" };
        continue;
      }
      try {
        stats[name] = await db.transaction((tx) => applyDiff(tx, table, keys, rows));
      } catch (e) {
        stats[name] = { read: rows.length, inserted: 0, updated: 0, deleted: 0, error: shortDbError(e) };
      }
    }
    // References are merged (a failed workbook keeps its previous reference values). They are only
    // used for cross-checks, so a problem here is recorded but never fails the sync.
    const refs = [...new Map(snap.references.map((r) => [r.key, r] as const)).values()]; // one value per key
    if (refs.length) {
      try {
        const prefixes = [...new Set(refs.map((r) => r.key.split(".")[0]))];
        await db.transaction(async (tx) => {
          for (const p of prefixes) await tx.delete(schema.referenceValues).where(sql`${schema.referenceValues.key} like ${p + ".%"}`);
          for (let i = 0; i < refs.length; i += 2000)
            await tx.insert(schema.referenceValues).values(refs.slice(i, i + 2000).map((r) => ({ ...r, hash: "" })));
        });
        stats.references = { read: refs.length, inserted: refs.length, updated: 0, deleted: 0 };
      } catch (e) {
        stats.references = { read: refs.length, inserted: 0, updated: 0, deleted: 0, error: shortDbError(e) };
      }
    }

    for (let i = 0; i < issues.length; i += 1000)
      await db.insert(schema.syncIssues).values(issues.slice(i, i + 1000).map((x) => ({ runId: run.id, source: x.source, tab: x.tab, rowRef: x.rowRef, severity: x.severity, code: x.code, message: x.message })));
    const old = await db.select({ id: schema.syncRuns.id }).from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).offset(KEEP_RUNS_WITH_ISSUES).limit(1);
    if (old.length) await db.delete(schema.syncIssues).where(lt(schema.syncIssues.runId, old[0].id));

    const tableErrors = Object.values(stats).filter((s) => s.error).length;
    const failedAll = Object.keys(snap.failures).length >= 3 || tableErrors === plan.length;
    const status = failedAll ? "failed" : Object.keys(snap.failures).length || tableErrors ? "partial" : "success";
    const error = Object.entries(snap.failures).map(([k, v]) => `${k}: ${v}`).join("; ") || null;
    await db.update(schema.syncRuns).set({ status, finishedAt: nowIso(), stats, error }).where(eq(schema.syncRuns.id, run.id));

    try {
      await refreshAlerts();
    } catch (e) {
      console.error("alert refresh failed", e);
    }
    return { runId: run.id, status, stats, issues: issues.length, error: error ?? undefined };
  } catch (e) {
    const msg = shortDbError(e);
    await db.update(schema.syncRuns).set({ status: "failed", finishedAt: nowIso(), stats, error: msg }).where(eq(schema.syncRuns.id, run.id));
    try {
      await refreshAlerts();
    } catch {}
    return { runId: run.id, status: "failed", stats, issues: 0, error: msg };
  }
}

export async function latestRuns(limit = 30) {
  const db = await getDb();
  return db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(limit);
}

export async function lastSuccessfulRun() {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.syncRuns)
    .where(inArray(schema.syncRuns.status, ["success", "partial"]))
    .orderBy(desc(schema.syncRuns.id))
    .limit(1);
  return r ?? null;
}
