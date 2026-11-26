import { Suspense } from "react";
import { count, desc, eq, isNull } from "drizzle-orm";
import { Shell } from "@/components/shell";
import { currentUser } from "@/auth";
import { getDb, schema, withDbTimeout } from "@/lib/db";
import { canApproveFor, getDataMode, whoAmI } from "@/lib/entry/store";

export const dynamic = "force-dynamic";

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const db = await withDbTimeout(getDb(), "connecting");
  const [runs, [alerts]] = await withDbTimeout(Promise.all([
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(10),
    db.select({ n: count() }).from(schema.alerts).where(isNull(schema.alerts.resolvedAt)),
  ]), "loading the sync status");
  const mode = await getDataMode(db);
  let pending = 0;
  if (mode === "app" && user.role !== "viewer") {
    const me = await whoAmI(user);
    const [leave, ot, emps] = await Promise.all([
      db.select({ k: schema.leaveRequests.employeeKey }).from(schema.leaveRequests).where(eq(schema.leaveRequests.approvalStatus, "Pending")),
      db.select({ k: schema.overtimeEntries.employeeKey }).from(schema.overtimeEntries).where(eq(schema.overtimeEntries.status, "Pending")),
      db.select({ key: schema.employees.key, section: schema.employees.section }).from(schema.employees),
    ]);
    const byKey = new Map(emps.map((e) => [e.key, e]));
    pending = [...leave, ...ot].filter((r) => r.k && canApproveFor(me, byKey.get(r.k))).length;
  }
  const last = runs[0];
  const lastGood = runs.find((r) => r.status === "success" || r.status === "partial");
  const sync = !last
    ? { label: "Never synced", tone: "critical" as const, title: "No data yet — run a sync from Data Sources" }
    : last.status === "failed"
      ? { label: `Sync failed · data from ${lastGood?.finishedAt ? ago(lastGood.finishedAt) : "never"}`, tone: "critical" as const, title: last.error ?? "Last sync failed" }
      : {
          label: `Synced ${ago((lastGood ?? last).finishedAt ?? (lastGood ?? last).startedAt)}`,
          tone: last.status === "partial" ? ("warning" as const) : ("good" as const),
          title: `Last successful sync: ${(lastGood ?? last).finishedAt}`,
        };
  const status =
    mode === "app"
      ? { label: "Live · in-app entry", tone: "good" as const, title: "Data is entered in the app; dashboards update on every save" }
      : sync;
  return (
    <Suspense fallback={<p className="p-8 text-center text-[13px] text-muted">Loading Wind Ops…</p>}>
      <Shell user={user} sync={status} alertCount={Number(alerts?.n ?? 0)} nav={{ mode, role: user.role, pending }}>
        {children}
      </Shell>
    </Suspense>
  );
}
