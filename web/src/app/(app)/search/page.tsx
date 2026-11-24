import Link from "next/link";
import { getDataset } from "@/lib/domain/dataset";
import { Badge, Card, CardBody, CardHeader, Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/domain/dates";
import { parseDayFirst } from "@/lib/sheets/normalize";
import { isOverdue } from "@/lib/domain/metrics";
import type { SP } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function Search({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const ds = await getDataset();
  const ql = q.toLowerCase();
  const has = (s: string | null | undefined) => Boolean(s && s.toLowerCase().includes(ql));

  const people = q ? ds.employees.filter((e) => has(e.name) || has(e.email) || has(e.employeeCode) || has(e.role) || has(e.section)).slice(0, 30) : [];
  const taskId = ql.match(/^tsk-?0*(\d+)$/)?.[1];
  const tasks = q ? ds.tasks.filter((t) => (taskId ? String(t.id) === taskId : has(t.title) || has(t.project) || has(t.description) || has(t.process))).slice(0, 30) : [];
  const leave = q ? ds.leave.filter((l) => l.workflowId === q || has(l.leaveType) && q.length >= 2 && l.leaveType.toLowerCase() === ql).slice(0, 50) : [];
  const procs = q ? [...ds.processes.values()].filter((p) => has(p.label) || has(p.column) || has(p.family)) : [];
  const date = q ? parseDayFirst(q) ?? (/^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null) : null;
  const statusMatch = q ? ds.tasks.filter((t) => t.status.toLowerCase() === ql || (ql === "overdue" && isOverdue(t, ds.today))) : [];
  const total = people.length + tasks.length + leave.length + procs.length + (date ? 1 : 0) + statusMatch.length;

  return (
    <div className="fade-in">
      <PageHeader title="Search" subtitle={q ? `${total} result group items for “${q}”` : "Search employees, employee IDs, task IDs, leave workflow IDs or types, processes, work categories, statuses or dates (DD/MM/YYYY)."} />
      <form action="/search" className="mb-5">
        <label htmlFor="sq" className="sr-only">
          Search
        </label>
        <input id="sq" name="q" defaultValue={q} autoFocus className="h-11 w-full max-w-xl rounded-xl border border-line-strong bg-surface px-4 text-[14px] text-ink focus:border-accent focus:outline-none" placeholder="e.g. Jyothi, FW102, TSK-0004, 1767161146, EL, Ext FQC, 05/01/2026" />
      </form>
      {q && total === 0 && <Empty title="No matches">Try a name, email, ID (FW…, TSK-…), workflow ID, process name or a date.</Empty>}
      <div className="grid gap-4 xl:grid-cols-2">
        {date && (
          <Card>
            <CardHeader title={`Date · ${fmtDate(date, true)}`} />
            <CardBody className="flex flex-wrap gap-2 text-[13px]">
              <Link className="font-medium text-accent hover:underline" href={`/reports?kind=daily&date=${date}`}>Daily report</Link>
              <Link className="font-medium text-accent hover:underline" href={`/attendance?preset=custom&from=${date}&to=${date}`}>Attendance that day</Link>
              <Link className="font-medium text-accent hover:underline" href={`/output?preset=custom&from=${date}&to=${date}`}>Output that day</Link>
            </CardBody>
          </Card>
        )}
        {people.length > 0 && (
          <Card>
            <CardHeader title="Employees" subtitle={`${people.length} found`} />
            <CardBody>
              <ul>
                {people.map((e) => (
                  <li key={e.key} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                    <Link href={`/employees/${encodeURIComponent(e.key)}`} className="font-medium text-ink hover:text-accent">
                      {e.name}
                    </Link>
                    <span className="flex gap-1">
                      {e.employeeCode && <Badge dot={false}>{e.employeeCode}</Badge>}
                      <Badge dot={false}>{e.section}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
        {(tasks.length > 0 || statusMatch.length > 0) && (
          <Card>
            <CardHeader title="Tasks" />
            <CardBody>
              <ul>
                {[...new Map([...tasks, ...statusMatch].map((t) => [t.id, t])).values()].map((t) => (
                  <li key={t.id} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                    <Link href="/tasks" className="text-ink hover:text-accent">
                      <span className="tnum mr-2 text-muted">TSK-{String(t.id).padStart(4, "0")}</span>
                      {t.title}
                    </Link>
                    <Badge tone={isOverdue(t, ds.today) ? "critical" : "neutral"}>{t.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
        {leave.length > 0 && (
          <Card>
            <CardHeader title="Leave requests" subtitle={`${leave.length} shown`} />
            <CardBody>
              <ul>
                {leave.map((l) => (
                  <li key={l.workflowId} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                    <Link href={`/employees/${encodeURIComponent(l.employeeKey)}`} className="text-ink hover:text-accent">
                      {ds.emp.get(l.employeeKey)?.name ?? l.employeeKey} · {l.leaveType} · {l.startDate ? fmtDate(l.startDate, true) : "—"}
                    </Link>
                    <Badge tone={l.effective ? "good" : "neutral"}>{l.approvalStatus || "Pending"}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
        {procs.length > 0 && (
          <Card>
            <CardHeader title="Processes & work categories" />
            <CardBody>
              <ul>
                {procs.map((p) => (
                  <li key={p.column} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                    <Link href={`/output?family=${encodeURIComponent(p.family)}`} className="text-ink hover:text-accent">
                      {p.label} <span className="text-muted">· {p.family}</span>
                    </Link>
                    {p.counts ? <Badge tone="good">Target {p.target.perDay}/day</Badge> : <Badge>No target</Badge>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
