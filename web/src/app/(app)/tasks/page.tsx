import Link from "next/link";
import { loadPage } from "@/lib/page";
import { can, currentUser } from "@/auth";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CardBody, CardHeader, Empty, KpiCard, PageHeader } from "@/components/ui";
import { BarRank, LineTrend } from "@/components/charts";
import { isOverdue, taskSummary, TASK_STATUSES } from "@/lib/domain/metrics";
import { addDays, fmtDate, weekStart } from "@/lib/domain/dates";
import { fmtNum, fmtPct, qs, type SP } from "@/lib/view";
import { DeleteTask, DueInput, NewTask, StatusSelect } from "./task-client";

export const dynamic = "force-dynamic";

const PRIO_TONE = { Critical: "critical", High: "warning", Medium: "neutral", Low: "neutral" } as const;
const code = (id: number) => `TSK-${String(id).padStart(4, "0")}`;

export default async function Tasks({ searchParams }: { searchParams: Promise<SP> }) {
  const { ds, sp, v, barProps } = await loadPage(searchParams);
  const user = await currentUser();
  const editable = can(user, "lead");
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) ?? "all";
  const sum = taskSummary(ds, { section: v.section, employee: v.employee });
  let tasks = sum.tasks;
  if (view === "overdue") tasks = tasks.filter((t) => isOverdue(t, ds.today));
  if (view === "open") tasks = tasks.filter((t) => t.status !== "Completed");
  if (view === "mine") tasks = tasks.filter((t) => t.assignedBy === user.email);
  const inPeriod = sum.tasks.filter((t) => t.completedOn && t.completedOn >= v.from && t.completedOn <= v.to);
  const dueInPeriod = sum.tasks.filter((t) => t.dueOn && t.dueOn >= v.from && t.dueOn <= v.to);
  const onTime = dueInPeriod.filter((t) => t.completedOn && t.completedOn <= t.dueOn!).length;

  // workload: open tasks per assignee
  const load = new Map<string, number>();
  for (const t of sum.tasks.filter((x) => x.status !== "Completed")) load.set(t.assigneeKey ?? "", (load.get(t.assigneeKey ?? "") ?? 0) + 1);
  const loadRows = [...load.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  // weekly created vs completed (last 12 weeks)
  const weeks: string[] = [];
  for (let w = addDays(weekStart(ds.today), -77); w <= ds.today; w = addDays(w, 7)) weeks.push(w);
  const created = weeks.map((w) => sum.tasks.filter((t) => t.assignedOn >= w && t.assignedOn <= addDays(w, 6)).length);
  const completed = weeks.map((w) => sum.tasks.filter((t) => t.completedOn && t.completedOn >= w && t.completedOn <= addDays(w, 6)).length);

  const name = (k: string | null) => (k ? ds.emp.get(k)?.name ?? k : "Unassigned");
  const employees = ds.employees.filter((e) => e.isActive).map((e) => ({ key: e.key, name: e.name })).sort((a, b) => a.name.localeCompare(b.name));
  const tabs: [string, string, number][] = [
    ["all", "All", sum.total],
    ["open", "Open", sum.open],
    ["overdue", "Overdue", sum.overdue],
    ["mine", "Assigned by me", sum.tasks.filter((t) => t.assignedBy === user.email).length],
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title="Task management"
        subtitle="Tasks are created and tracked in this app (the source sheets contain no task data). Every change is logged."
        actions={editable ? <NewTask employees={employees} processes={[...ds.processes.values()].map((p) => p.label).sort()} tasks={sum.tasks.filter((t) => t.status !== "Completed").map((t) => ({ id: t.id, title: t.title }))} today={ds.today} /> : <Badge>Read-only (viewer)</Badge>}
      />
      <FilterBar {...barProps} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total tasks" value={fmtNum(sum.total)} sub={`${sum.open} open`} href={`/tasks${qs(sp, { view: null })}`} />
        <KpiCard label="In progress" value={fmtNum(sum.inProgress)} href={`/tasks${qs(sp, { view: "open" })}`} />
        <KpiCard label="Overdue" value={fmtNum(sum.overdue)} tone={sum.overdue ? "critical" : "default"} sub="Past due, not completed" href={`/tasks${qs(sp, { view: "overdue" })}`} />
        <KpiCard label="Completed (period)" value={fmtNum(inPeriod.length)} sub={`${v.from} → ${v.to}`} />
        <KpiCard label="On-time completion" value={fmtPct(dueInPeriod.length ? (onTime / dueInPeriod.length) * 100 : null)} sub={`${onTime} of ${dueInPeriod.length} due in period`} formula="Tasks due in the period that were completed on or before their due date ÷ all tasks due in the period." />
        <KpiCard label="Unassigned" value={fmtNum(load.get("") ?? 0)} tone={(load.get("") ?? 0) > 0 ? "warning" : "default"} sub="Open tasks without an owner" />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Workload distribution" subtitle="Open tasks per assignee" />
          <CardBody>{loadRows.length ? <BarRank labels={loadRows.map(([k]) => name(k || null))} values={loadRows.map(([, n]) => n)} label="Open tasks per assignee" color="var(--s1)" /> : <Empty title="No open tasks" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Task completion trend" subtitle="Created vs completed per week (last 12 weeks)" />
          <CardBody>
            <LineTrend categories={weeks.map((w) => fmtDate(w))} series={[{ name: "Created", color: "var(--s1)", data: created }, { name: "Completed", color: "var(--s2)", data: completed }]} label="Tasks created vs completed per week" />
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title="Board" subtitle="By status" />
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {TASK_STATUSES.map((st) => {
              const items = sum.tasks.filter((t) => t.status === st);
              return (
                <div key={st} className="rounded-xl bg-surface-2 p-2.5">
                  <p className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-medium text-ink-2">
                    {st} <span className="tnum text-muted">{items.length}</span>
                  </p>
                  <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                    {items.slice(0, 30).map((t) => (
                      <li key={t.id} className="rounded-lg border border-line bg-surface p-2.5 text-[12.5px]">
                        <p className="font-medium text-ink">{t.title}</p>
                        <p className="mt-0.5 text-[11.5px] text-ink-2">
                          {code(t.id)} · {name(t.assigneeKey)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Badge tone={PRIO_TONE[t.priority as keyof typeof PRIO_TONE] ?? "neutral"}>{t.priority}</Badge>
                          {t.dueOn && <Badge tone={isOverdue(t, ds.today) ? "critical" : "neutral"}>Due {fmtDate(t.dueOn)}</Badge>}
                        </div>
                      </li>
                    ))}
                    {items.length === 0 && <li className="px-1 text-[12px] text-muted">Empty</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Tasks"
          actions={
            <nav className="flex gap-1" aria-label="Task views">
              {tabs.map(([k, l, n]) => (
                <Link key={k} href={`/tasks${qs(sp, { view: k === "all" ? null : k })}`} aria-current={view === k ? "page" : undefined} className={`rounded-lg px-2.5 py-1 text-[12.5px] font-medium ${view === k ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"}`}>
                  {l} <span className="tnum text-muted">{n}</span>
                </Link>
              ))}
            </nav>
          }
        />
        <CardBody>
          {tasks.length === 0 ? (
            <Empty title="No tasks here">{editable ? "Use “New task” to create and assign one." : "Tasks created by leads and managers will appear here."}</Empty>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-[12px] text-ink-2">
                  <tr>
                    {["Task ID", "Task", "Assigned to", "Project", "Priority", "Assigned", "Due", "Status", "Depends on", ""].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-t border-line align-top">
                      <td className="tnum px-3 py-2.5 whitespace-nowrap text-ink-2">{code(t.id)}</td>
                      <td className="max-w-[320px] px-3 py-2.5">
                        <p className="font-medium text-ink">{t.title}</p>
                        {(t.description || t.remarks) && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{[t.description, t.remarks].filter(Boolean).join(" · ")}</p>}
                        <p className="mt-0.5 text-[11.5px] text-muted">by {t.assignedBy}</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {t.assigneeKey ? (
                          <Link className="text-ink hover:text-accent" href={`/employees/${encodeURIComponent(t.assigneeKey)}`}>
                            {name(t.assigneeKey)}
                          </Link>
                        ) : (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{t.project || t.process || "—"}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={PRIO_TONE[t.priority as keyof typeof PRIO_TONE] ?? "neutral"}>{t.priority}</Badge>
                      </td>
                      <td className="tnum px-3 py-2.5 whitespace-nowrap text-ink-2">{fmtDate(t.assignedOn)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {editable ? <DueInput id={t.id} due={t.dueOn} /> : t.dueOn ? fmtDate(t.dueOn, true) : "—"}
                        {isOverdue(t, ds.today) && (
                          <span className="mt-1 block">
                            <Badge tone="critical">Overdue</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{editable ? <StatusSelect id={t.id} status={t.status} /> : t.status}</td>
                      <td className="px-3 py-2.5 text-[12px] text-ink-2">{t.dependsOn.length ? t.dependsOn.map(code).join(", ") : "—"}</td>
                      <td className="px-3 py-2.5">{can(user, "manager") && <DeleteTask id={t.id} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
