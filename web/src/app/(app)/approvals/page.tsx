import { asc, eq } from "drizzle-orm";
import { currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { fmtDate } from "@/lib/domain/dates";
import { leaveDaysRequested } from "@/lib/domain/calendar-engine";
import { canApproveFor, whoAmI } from "@/lib/entry/store";
import { requireAppModePage } from "@/lib/entry/page-guard";
import { teamLabel } from "@/lib/teams";
import { Badge, Card, CardHeader, Empty, PageHeader, Table, td, th } from "@/components/ui";
import { Decision } from "@/components/entry/forms";

export const dynamic = "force-dynamic";

export default async function Approvals() {
  const guard = await requireAppModePage("Approvals");
  if (guard) return guard;
  const me = await whoAmI(await currentUser());
  const db = await getDb();
  const [emps, leaves, ot, hol] = await Promise.all([
    db.select().from(schema.employees),
    db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.approvalStatus, "Pending")).orderBy(asc(schema.leaveRequests.startDate)),
    db.select().from(schema.overtimeEntries).where(eq(schema.overtimeEntries.status, "Pending")).orderBy(asc(schema.overtimeEntries.date)),
    db.select().from(schema.holidays),
  ]);
  const holidays = new Map(hol.map((h) => [h.date, h.name]));
  const emp = new Map(emps.map((e) => [e.key, e]));
  const myLeaves = leaves.filter((l) => canApproveFor(me, emp.get(l.employeeKey)));
  const myOt = ot.filter((o) => o.employeeKey && canApproveFor(me, emp.get(o.employeeKey)));

  return (
    <div className="fade-in">
      <PageHeader title="Approvals" subtitle="Requests from your team waiting for a decision. Approved leave updates the attendance calendar straight away." />
      <div className="grid gap-4">
        <Card>
          <CardHeader title={`Leave, WFH & working-day requests (${myLeaves.length})`} />
          {myLeaves.length === 0 ? (
            <div className="p-4"><Empty title="Nothing waiting">New requests from your team will appear here.</Empty></div>
          ) : (
            <Table>
              <thead>
                <tr>{["Person", "Request", "Dates", "Days", "Reason", "Decision"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {myLeaves.map((l) => {
                  const e = emp.get(l.employeeKey);
                  const days = e && l.startDate && l.endDate ? leaveDaysRequested({ key: e.key, weekOff: e.weekOff, workLocation: e.workLocation, joinedOn: e.joinedOn, leftOn: e.leftOn }, l.startDate, l.endDate, l.halfDay, holidays) : null;
                  return (
                    <tr key={l.workflowId}>
                      <td className={td}>
                        <span className="font-medium">{e?.name ?? l.employeeKey}</span>
                        <span className="block text-[11.5px] text-ink-2">{e ? teamLabel(e.section) : ""}</span>
                      </td>
                      <td className={td}>
                        {l.leaveType} {/unplanned/i.test(l.requestKind) && <Badge tone="warning">unplanned</Badge>}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {l.startDate ? fmtDate(l.startDate, true) : "—"}
                        {l.endDate && l.endDate !== l.startDate ? ` – ${fmtDate(l.endDate, true)}` : ""}
                        {l.halfDay ? ` (${l.halfDay} half)` : ""}
                      </td>
                      <td className={`${td} tnum`}>{days ?? "—"}</td>
                      <td className={`${td} max-w-[240px] text-ink-2`}>{l.comment}</td>
                      <td className={td}><Decision kind="leave" id={l.workflowId} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={`Overtime (${myOt.length})`} />
          {myOt.length === 0 ? (
            <div className="p-4"><Empty title="Nothing waiting">Overtime logged by your team will appear here.</Empty></div>
          ) : (
            <Table>
              <thead>
                <tr>{["Person", "Date", "Work", "Time", "Turbines", "Decision"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {myOt.map((o) => (
                  <tr key={o.rowKey}>
                    <td className={td}><span className="font-medium">{o.analystName}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{fmtDate(o.date, true)}</td>
                    <td className={td}>{o.process}</td>
                    <td className={`${td} tnum whitespace-nowrap`}>{o.timeStart}–{o.timeEnd} · {o.shift}</td>
                    <td className={td}>{o.turbinesText || "—"}</td>
                    <td className={td}><Decision kind="overtime" id={o.rowKey} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
