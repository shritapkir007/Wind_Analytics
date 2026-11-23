import Link from "next/link";
import { desc, isNotNull, isNull } from "drizzle-orm";
import { AlertTriangle, BellRing, Info, ShieldAlert } from "lucide-react";
import { can, currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, Empty, KpiCard, PageHeader, ButtonLink } from "@/components/ui";
import { AckButton } from "@/components/admin-client";
import { ALERT_KINDS, getSettings } from "@/lib/domain/settings";
import { fmtDate } from "@/lib/domain/dates";
import { qs, type SP } from "@/lib/view";

export const dynamic = "force-dynamic";

const ICON = { critical: ShieldAlert, warning: AlertTriangle, info: Info } as const;
const ORDER = { critical: 0, warning: 1, info: 2 } as const;

function subjectHref(a: { subjectType: string; subjectId: string | null }) {
  if (a.subjectType === "employee" && a.subjectId) return `/employees/${encodeURIComponent(a.subjectId)}`;
  if (a.subjectType === "task") return "/tasks?view=overdue";
  if (a.subjectType === "stream") return "/output#deliveries";
  if (a.subjectType === "sync" || a.subjectType === "data") return "/data-sources";
  return null;
}

export default async function Alerts({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const settings = await getSettings();
  const db = await getDb();
  const show = sp.show === "resolved" ? "resolved" : "open";
  const kind = typeof sp.kind === "string" && sp.kind in ALERT_KINDS ? sp.kind : undefined;
  const sev = typeof sp.severity === "string" ? sp.severity : undefined;
  const rows = await db
    .select()
    .from(schema.alerts)
    .where(show === "open" ? isNull(schema.alerts.resolvedAt) : isNotNull(schema.alerts.resolvedAt))
    .orderBy(desc(schema.alerts.date))
    .limit(show === "open" ? 2000 : 300);
  const open = show === "open" ? rows : [];
  const list = rows
    .filter((a) => (!kind || a.kind === kind) && (!sev || a.severity === sev))
    .sort((a, b) => ORDER[a.severity as keyof typeof ORDER] - ORDER[b.severity as keyof typeof ORDER] || (a.date < b.date ? 1 : -1));
  const byKind = Object.keys(ALERT_KINDS).map((k) => ({ k, n: open.filter((a) => a.kind === k).length }));
  const channels = [
    settings.notifications.slack.enabled && settings.notifications.slack.webhookConfigured ? "Slack" : null,
    settings.notifications.teams.enabled && settings.notifications.teams.webhookConfigured ? "Teams" : null,
  ].filter(Boolean);

  return (
    <div className="fade-in">
      <PageHeader
        title="Alerts & notifications"
        subtitle={<>Re-evaluated after every sync and task change. External notifications: {channels.length ? channels.join(", ") : "none enabled (in-app only)"}.</>}
        actions={can(user, "admin") ? <ButtonLink href="/settings">Configure thresholds</ButtonLink> : undefined}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Open alerts" value={String(open.length)} href="/alerts" />
        <KpiCard label="Critical" value={String(open.filter((a) => a.severity === "critical").length)} tone={open.some((a) => a.severity === "critical") ? "critical" : "default"} href={`/alerts${qs(sp, { severity: "critical" })}`} />
        <KpiCard label="Warnings" value={String(open.filter((a) => a.severity === "warning").length)} href={`/alerts${qs(sp, { severity: "warning" })}`} />
        <KpiCard label="Unacknowledged" value={String(open.filter((a) => !a.acknowledgedAt && a.severity !== "info").length)} sub="Critical & warning" />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-1">
          <CardHeader title="Alert types" />
          <CardBody>
            <ul className="flex flex-col gap-0.5">
              <li>
                <Link href={`/alerts${qs(sp, { kind: null })}`} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] ${!kind ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface-2"}`}>
                  All types <span className="tnum">{open.length}</span>
                </Link>
              </li>
              {byKind.map(({ k, n }) => (
                <li key={k}>
                  <Link href={`/alerts${qs(sp, { kind: k })}`} title={ALERT_KINDS[k].description} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] ${kind === k ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface-2"}`}>
                    <span className={settings.enabledAlerts[k] === false ? "line-through opacity-60" : ""}>{ALERT_KINDS[k].label}</span>
                    <span className="tnum">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader
            title={show === "open" ? "Open alerts" : "Recently resolved"}
            subtitle={kind ? ALERT_KINDS[kind].description : "Most severe first"}
            actions={
              <nav className="flex gap-1">
                {(["open", "resolved"] as const).map((s) => (
                  <Link key={s} href={`/alerts${qs(sp, { show: s === "open" ? null : s })}`} className={`rounded-lg px-2.5 py-1 text-[12.5px] font-medium capitalize ${show === s ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"}`}>
                    {s}
                  </Link>
                ))}
                {sev && (
                  <Link href={`/alerts${qs(sp, { severity: null })}`} className="rounded-lg px-2.5 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2">
                    Clear severity
                  </Link>
                )}
              </nav>
            }
          />
          <CardBody>
            {list.length === 0 ? (
              <Empty title={show === "open" ? "No open alerts" : "Nothing resolved recently"}>
                <BellRing size={16} className="mx-auto mb-1" aria-hidden />
              </Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.slice(0, 300).map((a) => {
                  const Icon = ICON[a.severity as keyof typeof ICON] ?? Info;
                  const href = subjectHref(a);
                  return (
                    <li key={a.key} className="flex flex-wrap items-start gap-3 rounded-xl border border-line p-3">
                      <Icon size={17} className={a.severity === "critical" ? "mt-0.5 text-critical" : a.severity === "warning" ? "mt-0.5 text-serious" : "mt-0.5 text-muted"} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-ink">{href ? <Link href={href} className="hover:text-accent">{a.title}</Link> : a.title}</p>
                        <p className="text-[12.5px] text-ink-2">{a.message}</p>
                        <p className="mt-1 text-[11.5px] text-muted">
                          {ALERT_KINDS[a.kind]?.label ?? a.kind} · {fmtDate(a.date, true)}
                          {a.acknowledgedBy && ` · acknowledged by ${a.acknowledgedBy}`}
                          {a.resolvedAt && ` · resolved ${a.resolvedAt.slice(0, 10)}`}
                        </p>
                      </div>
                      <Badge tone={a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "neutral"}>{a.severity}</Badge>
                      {show === "open" && !a.acknowledgedAt && can(user, "lead") && a.severity !== "info" && <AckButton id={a.key} />}
                    </li>
                  );
                })}
              </ul>
            )}
            {list.length > 300 && <p className="mt-3 text-[12px] text-muted">Showing 300 of {list.length}. Filter by type to narrow down.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
