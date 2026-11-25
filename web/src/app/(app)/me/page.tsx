import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { todayIST } from "@/lib/config";
import { getDataset } from "@/lib/domain/dataset";
import { addDays, eachDay, fmtDate } from "@/lib/domain/dates";
import { canActFor, whoAmI } from "@/lib/entry/store";
import { requireAppModePage } from "@/lib/entry/page-guard";
import { PROCESSES } from "@/lib/processes";
import { teamLabel } from "@/lib/teams";
import { fmtNum, type SP } from "@/lib/view";
import { Badge, Card, CardBody, CardHeader, Empty, PageHeader, Table, td, th } from "@/components/ui";
import { CancelLeave, LeaveForm, OutputForm, OvertimeForm } from "@/components/entry/forms";

export const dynamic = "force-dynamic";

const tone = (s: string) => (s === "Approved" ? "good" : s === "Declined" || s === "Cancelled" ? "critical" : "warning");

export default async function MyWorkspace({ searchParams }: { searchParams: Promise<SP> }) {
  const guard = await requireAppModePage("My workspace");
  if (guard) return guard;
  const sp = await searchParams;
  const me = await whoAmI(await currentUser());
  const ds = await getDataset();
  const today = todayIST();
  const team = ds.employees.filter((e) => e.isActive && canActFor(me, e)).sort((a, b) => a.name.localeCompare(b.name));
  const wanted = typeof sp.for === "string" ? sp.for : me.employee?.key;
  const person = team.find((e) => e.key === wanted) ?? (me.employee && team.find((e) => e.key === me.employee!.key)) ?? null;

  if (!person) {
    return (
      <div className="fade-in">
        <PageHeader title="My workspace" />
        <Empty title="You're not on the team roster yet">
          Your sign-in ({me.user.email}) doesn&apos;t match anyone in People &amp; Teams. Ask a manager to add you with this email.
        </Empty>
      </div>
    );
  }

  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const db = await getDb();
  const [sub, recent, leaves, ot] = await Promise.all([
    db.select().from(schema.outputSubmissions).where(and(eq(schema.outputSubmissions.employeeKey, person.key), eq(schema.outputSubmissions.date, date))),
    db.select().from(schema.outputSubmissions).where(and(eq(schema.outputSubmissions.employeeKey, person.key), gte(schema.outputSubmissions.date, addDays(today, -30)))).orderBy(desc(schema.outputSubmissions.date)),
    db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.employeeKey, person.key)).orderBy(desc(schema.leaveRequests.startDate)).limit(30),
    db.select().from(schema.overtimeEntries).where(eq(schema.overtimeEntries.employeeKey, person.key)).orderBy(desc(schema.overtimeEntries.date)).limit(30),
  ]);
  const usual = [...new Set(recent.flatMap((r) => Object.keys(r.entries)))];
  const processes = PROCESSES.map((p) => ({ column: p.column, label: p.label, family: p.family, target: ds.processes.get(p.column)?.target.perDay ?? null }));
  const targetOf = new Map(processes.map((p) => [p.column, p.target]));
  const own = me.employee?.key === person.key;
  const calendar = [...eachDay(addDays(today, -6), addDays(today, 14))].map((d) => ({ date: d, rawCode: ds.calendar.get(`${person.key}|${d}`)?.rawCode ?? null }));

  return (
    <div className="fade-in">
      <PageHeader
        title={own ? "My workspace" : `Workspace · ${person.name}`}
        subtitle={`${teamLabel(person.section)} · log the day's output, extra work, leave and overtime`}
        actions={
          team.length > 1 ? (
            <form className="flex items-center gap-2" action="/me">
              <label htmlFor="for" className="text-[12.5px] text-ink-2">
                Working for
              </label>
              <select id="for" name="for" defaultValue={person.key} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-[13px]">
                {team.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button className="h-9 rounded-lg border border-line-strong px-3 text-[13px]">Open</button>
            </form>
          ) : null
        }
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader title="Daily output" subtitle="One entry per person per day — saving again updates it. Target-days = quantity ÷ the process target." />
          <CardBody>
            <OutputForm key={`${person.key}|${date}`} employeeKey={person.key} date={date} today={today} processes={processes} usual={usual} existing={sub[0] ? { entries: sub[0].entries, otherWork: sub[0].otherWork } : null} />
          </CardBody>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Request leave, WFH or a working day" subtitle="Goes to your team lead for approval; the attendance calendar updates once approved" />
            <CardBody>
              <LeaveForm employeeKey={person.key} today={today} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Log overtime" subtitle="Extra hours or a day off worked. Counted once your lead approves." />
            <CardBody>
              <OvertimeForm employeeKey={person.key} today={today} processes={PROCESSES.map((p) => p.label)} />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Leave & WFH requests" />
            <Table>
              <thead>
                <tr>
                  {["Dates", "Type", "Status", ""].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l.workflowId}>
                    <td className={td}>
                      {l.startDate ? fmtDate(l.startDate, true) : "—"}
                      {l.endDate && l.endDate !== l.startDate ? ` – ${fmtDate(l.endDate, true)}` : ""}
                      {l.halfDay ? ` (${l.halfDay} half)` : ""}
                    </td>
                    <td className={td}>{l.leaveType}{/unplanned/i.test(l.requestKind) ? " · unplanned" : ""}</td>
                    <td className={td}>
                      <Badge tone={tone(l.approvalStatus)}>{l.approvalStatus || "—"}</Badge>
                      {l.leadComment && <span className="block text-[11.5px] text-ink-2">{l.leadComment}</span>}
                    </td>
                    <td className={td}>{(l.approvalStatus === "Pending" || (l.approvalStatus === "Approved" && l.startDate && l.startDate > today)) && <CancelLeave id={l.workflowId} />}</td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr><td className={td} colSpan={4}>No requests yet.</td></tr>
                )}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Overtime" />
            <Table>
              <thead>
                <tr>
                  {["Date", "Work", "Time", "Status"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ot.map((o) => (
                  <tr key={o.rowKey}>
                    <td className={td}>{fmtDate(o.date, true)}</td>
                    <td className={td}>{o.process}{o.turbinesText ? ` · ${o.turbinesText}` : ""}</td>
                    <td className={`${td} tnum`}>{o.timeStart}–{o.timeEnd} · {o.shift}</td>
                    <td className={td}>
                      <Badge tone={tone(o.status)}>{o.status}</Badge>
                      {o.reviewComment && <span className="block text-[11.5px] text-ink-2">{o.reviewComment}</span>}
                    </td>
                  </tr>
                ))}
                {ot.length === 0 && (
                  <tr><td className={td} colSpan={4}>No overtime logged.</td></tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Last 30 days of output" subtitle="Click a date to edit it" />
            <Table>
              <thead>
                <tr>
                  {["Date", "Processes", "Target-days", "Extra work"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const td_ = Object.entries(r.entries).reduce((a, [k, n]) => a + (targetOf.get(k) ? n / targetOf.get(k)! : 0), 0);
                  return (
                    <tr key={r.date}>
                      <td className={td}>
                        <Link className="text-accent hover:underline" href={`/me?for=${encodeURIComponent(person.key)}&date=${r.date}`}>
                          {fmtDate(r.date, true)}
                        </Link>
                      </td>
                      <td className={td}>{Object.entries(r.entries).map(([k, n]) => `${PROCESSES.find((p) => p.column === k)?.label ?? k} ${fmtNum(n, 2)}`).join(", ") || "—"}</td>
                      <td className={`${td} tnum`}>{fmtNum(td_, 2)}</td>
                      <td className={`${td} max-w-[220px] truncate text-ink-2`}>{r.otherWork ?? ""}</td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr><td className={td} colSpan={4}>Nothing logged in the last 30 days.</td></tr>
                )}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="My calendar" subtitle="Last 7 days and the next 2 weeks, as the dashboards see it" />
            <CardBody>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {calendar.map((c) => (
                  <li key={c.date} className={`rounded-lg border p-2 text-[12px] ${c.date === today ? "border-accent" : "border-line"}`}>
                    <span className="block text-ink-2">{fmtDate(c.date)}</span>
                    <span className="block font-medium text-ink">{c.rawCode === null ? "—" : c.rawCode || "Present"}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
