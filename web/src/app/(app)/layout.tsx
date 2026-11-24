import { Suspense } from "react";
import { count, desc, isNull } from "drizzle-orm";
import { Shell } from "@/components/shell";
import { currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";

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
  const db = await getDb();
  const [runs, [alerts]] = await Promise.all([
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(10),
    db.select({ n: count() }).from(schema.alerts).where(isNull(schema.alerts.resolvedAt)),
  ]);
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
  return (
    <Suspense fallback={<p className="p-8 text-center text-[13px] text-muted">Loading Wind Ops…</p>}>
      <Shell user={user} sync={sync} alertCount={Number(alerts?.n ?? 0)}>
        {children}
      </Shell>
    </Suspense>
  );
}
