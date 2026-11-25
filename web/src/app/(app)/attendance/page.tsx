import Link from "next/link";
import { loadPage } from "@/lib/page";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CardBody, CardHeader, Empty, KpiCard, PageHeader } from "@/components/ui";
import { ColumnChart, LineTrend } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { isWorkingRequest } from "@/lib/sheets/parsers/leave";
import { LeaveCalendar } from "@/components/leave-calendar";
import {
  attendanceFor,
  attendanceSeries,
  change,
  comparisonPeriod,
  dayStatus,
  employeesInScope,
  headcount,
  isPendingLeave,
  leaveRequestsInRange,
  previousWorkingDay,
  upcomingLeave,
} from "@/lib/domain/metrics";
import { fmtDate, fmtMonth, fmtRange, monthEnd, monthStart, diffDays } from "@/lib/domain/dates";
import { fmtNum, fmtPct, qs, type SP } from "@/lib/view";

export const dynamic = "force-dynamic";

const LEAVE_TYPES = ["EL", "CL", "WL", "PL", "EL CF", "Comp Off"];
const LEAVE_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];

export default async function Attendance({ searchParams }: { searchParams: Promise<SP> }) {
  const { ds, sp, v, filter, barProps } = await loadPage(searchParams);
  const scope = { section: v.section, employee: v.employee };
  const people = employeesInScope(ds, scope).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
  const date = v.preset === "today" || v.from === v.to ? v.to : ds.today;
  const hc = headcount(ds, date, scope);
  const prev = previousWorkingDay(ds, date);
  const hcPrev = headcount(ds, prev, scope);
  const status = dayStatus(ds, date, scope);
  const yesterday = dayStatus(ds, prev, scope);

  const att = people.map((e) => ({ e, a: attendanceFor(ds, e.key, filter) }));
  const sched = att.reduce((s, x) => s + x.a.scheduledDays, 0);
  const pres = att.reduce((s, x) => s + x.a.presentDays, 0);
  const cmp = comparisonPeriod(ds, filter);
  const attPrev = people.map((e) => attendanceFor(ds, e.key, cmp));
  const sPrev = attPrev.reduce((s, x) => s + x.scheduledDays, 0);
  const pPrev = attPrev.reduce((s, x) => s + x.presentDays, 0);
  const leaveDays = att.reduce((s, x) => s + x.a.leaveDays, 0);
  const leaveDaysPrev = attPrev.reduce((s, x) => s + x.leaveDays, 0);
  const requests = leaveRequestsInRange(ds, filter);
  const pendingAll = ds.leave.filter((l) => isPendingLeave(l) && (!v.employee || l.employeeKey === v.employee) && (!v.section || ds.emp.get(l.employeeKey)?.section === v.section));
  const upcoming = upcomingLeave(ds, scope, 30);

  // calendar month = month containing the period end
  const calFrom = monthStart(v.to);
  const calTo = monthEnd(v.to);

  // trends
  const trendFrom = diffDays(v.from, v.to) < 27 ? monthStart(v.to) : v.from;
  const tSeries = attendanceSeries(ds, { ...filter, from: trendFrom }, v.grain);
  const tCats = tSeries.map((p) => (v.grain === "month" ? fmtMonth(p.bucket) : fmtDate(p.bucket)));

  // leave days by type per month (year to date)
  const monthList: string[] = [];
  for (let mo = 1; mo <= Number(ds.today.slice(5, 7)); mo++) monthList.push(`${ds.today.slice(0, 4)}-${String(mo).padStart(2, "0")}-01`);
  const byTypeMonth = LEAVE_TYPES.map((t) => monthList.map((m) => people.reduce((s, e) => s + (attendanceFor(ds, e.key, { from: m, to: monthEnd(m) }).byLeaveType[t] ?? 0), 0)));

  // team distribution
  const sections = [...new Set(people.map((p) => p.section))];
  const teamRows = sections.map((sec) => {
    const rows = att.filter((x) => x.e.section === sec);
    const s = rows.reduce((a, x) => a + x.a.scheduledDays, 0);
    const p = rows.reduce((a, x) => a + x.a.presentDays, 0);
    const byType: Record<string, number> = {};
    for (const x of rows) for (const [k, n] of Object.entries(x.a.byLeaveType)) byType[k] = (byType[k] ?? 0) + n;
    return { sec, people: rows.length, s, p, byType, leave: rows.reduce((a, x) => a + x.a.leaveDays, 0), lop: rows.reduce((a, x) => a + x.a.lopDays, 0) };
  });

  const q = (o: Record<string, string | null> = {}) => qs(sp, o);
  const group = (st: string[]) => status.filter((r) => st.includes(r.status));

  return (
    <div className="fade-in">
      <PageHeader title="Attendance & leaves" subtitle={<>Calendar View is the source of truth for attendance · status shown for <strong className="font-medium text-ink">{fmtDate(date, true)}</strong>, totals for {fmtRange(v.from, v.to)}</>} />
      <FilterBar {...barProps} showGrain />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={`Present · ${fmtDate(date)}`} value={fmtNum(hc.present, 1)} sub={`of ${hc.active} active · ${hc.wfh} WFH`} delta={{ ...change(hc.present, hcPrev.present), label: `vs ${fmtDate(prev)}` }} formula="Blank, Working or WFH = 1; half-day leave = 0.5 (Calendar View)." />
        <KpiCard label={`On leave · ${fmtDate(date)}`} value={fmtNum(hc.onLeave)} sub={`${hc.halfDay} half-day`} delta={{ ...change(hc.onLeave, hcPrev.onLeave), upIsGood: false, label: `vs ${fmtDate(prev)}` }} />
        <KpiCard label={`Absent · ${fmtDate(date)}`} value={fmtNum(hc.absent)} tone={hc.absent ? "warning" : "default"} sub={hc.unplannedLeave ? `LoP only · ${hc.unplannedLeave} on unplanned leave` : "LoP in Calendar View"} formula="People marked LoP in Calendar View. Unplanned leave counts as leave (shown with an Unplanned tag), not absence." />
        <KpiCard label="Attendance rate" value={fmtPct(sched ? (pres / sched) * 100 : null, 1)} sub={`${fmtNum(pres, 1)} of ${fmtNum(sched)} scheduled person-days`} delta={{ ...change(sched ? (pres / sched) * 100 : null, sPrev ? (pPrev / sPrev) * 100 : null), label: `vs ${fmtRange(cmp.from, cmp.to)}`, suffix: " pts" }} formula="Σ presence ÷ scheduled days (days that are not Week Off or Public Holiday), up to today." />
        <KpiCard label="Leave days taken" value={fmtNum(leaveDays, 1)} sub={fmtRange(v.from, v.to)} delta={{ ...change(leaveDays, leaveDaysPrev), upIsGood: false, label: `vs previous period` }} formula="Counted from Calendar View codes (half day = 0.5), not from request date ranges." />
        <KpiCard label="Leave requests in period" value={fmtNum(requests.length)} sub={`${requests.filter((r) => r.effective).length} approved & effective · ${requests.filter((r) => /unplanned/i.test(r.requestKind)).length} unplanned`} />
        <KpiCard label="Pending approval" value={fmtNum(pendingAll.length)} tone={pendingAll.length ? "warning" : "default"} sub="Leave Tracker, any date" href="#requests" />
        <KpiCard label="Upcoming leave · 30 days" value={fmtNum(upcoming.length)} sub={upcoming[0] ? `Next: ${ds.emp.get(upcoming[0].employeeKey)?.name ?? upcoming[0].employeeKey}, ${fmtDate(upcoming[0].startDate!)}` : "None scheduled"} href="#upcoming" />
      </div>

      <div id="today" className="mb-4 grid gap-4 lg:grid-cols-4">
        {[
          { t: "On leave", rows: group(["leave", "half_leave"]), tone: "warning" as const },
          { t: "Absent (LoP)", rows: group(["absent"]), tone: "critical" as const },
          { t: "Working from home", rows: group(["wfh"]), tone: "accent" as const },
          { t: `No output logged · ${fmtDate(prev)}`, rows: yesterday.filter((r) => (r.day?.presence ?? 0) > 0 && !r.outputLogged), tone: "neutral" as const },
        ].map((g) => (
          <Card key={g.t}>
            <CardHeader title={g.t} subtitle={`${g.rows.length} ${g.rows.length === 1 ? "person" : "people"}`} />
            <CardBody>
              {g.rows.length === 0 ? (
                <p className="text-[13px] text-muted">Nobody.</p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {g.rows.map((r) => (
                    <li key={r.employee.key} className="flex items-center justify-between gap-2 text-[13px]">
                      <Link className="truncate text-ink hover:text-accent" href={`/employees/${encodeURIComponent(r.employee.key)}${q({ employee: null })}`}>
                        {r.employee.name}
                      </Link>
                      <span className="flex shrink-0 items-center gap-1">
                        {r.unplanned && <Badge dot={false}>Unplanned</Badge>}
                        <Badge tone={g.tone}>{r.day?.rawCode || (r.status === "present" ? "Working" : r.status)}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <CardHeader title={`Leave calendar · ${fmtMonth(calFrom)}`} subtitle="Hover a cell for the exact Calendar View code. Change the period to see another month." info="Each cell shows the Calendar View code for that day. 'Pending leave' marks requests in Leave Tracker that are not yet approved. 'Absent' is LoP; unplanned leave is shown as leave." />
        <CardBody>
          {people.length ? <LeaveCalendar ds={ds} people={people} from={calFrom} to={calTo} linkQs={q({ employee: null })} /> : <Empty title="No people in scope" />}
        </CardBody>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Attendance rate trend" subtitle={`Present ÷ scheduled, per ${v.grain}`} />
          <CardBody>
            <LineTrend categories={tCats} series={[{ name: "Attendance rate", color: "var(--s1)", data: tSeries.map((p) => (p.attendancePct == null ? null : Math.round(p.attendancePct * 10) / 10)) }]} yName="%" label="Attendance rate trend" area />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Leave days by type · ${ds.today.slice(0, 4)}`} subtitle="From Calendar View codes (half day = 0.5)" />
          <CardBody>
            <ColumnChart categories={monthList.map((m) => fmtMonth(m).slice(0, 3))} series={LEAVE_TYPES.map((t, i) => ({ name: t, color: LEAVE_COLORS[i], stack: "l", data: byTypeMonth[i] }))} label="Leave days by type per month" />
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title="Team-wise leave distribution" subtitle={fmtRange(v.from, v.to)} />
        <CardBody>
          <DataTable
            searchable={false}
            filename="team-leave-distribution"
            columns={[
              { key: "sec", header: "Team / section" },
              { key: "people", header: "People", align: "right" },
              { key: "att", header: "Attendance", align: "right" },
              ...LEAVE_TYPES.map((t) => ({ key: t, header: t, align: "right" as const })),
              { key: "lop", header: "LoP", align: "right" },
              { key: "leave", header: "Total leave days", align: "right" },
            ]}
            rows={teamRows.map((r) => ({
              sec: r.sec,
              people: r.people,
              att: { v: r.s ? (r.p / r.s) * 100 : null, label: fmtPct(r.s ? (r.p / r.s) * 100 : null, 1) },
              ...Object.fromEntries(LEAVE_TYPES.map((t) => [t, r.byType[t] ?? 0])),
              lop: r.lop,
              leave: r.leave,
            }))}
          />
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Employee attendance" subtitle={fmtRange(v.from, v.to)} info="Scheduled = days that are not Week Off / Public Holiday (up to today). Present counts half days as 0.5." />
        <CardBody>
          <DataTable
            filename="employee-attendance"
            initialSort={{ key: "pct" }}
            columns={[
              { key: "name", header: "Employee" },
              { key: "section", header: "Team", hideOnMobile: true },
              { key: "sched", header: "Scheduled", align: "right" },
              { key: "present", header: "Present", align: "right" },
              { key: "pct", header: "Attendance", align: "right" },
              { key: "leave", header: "Leave days", align: "right" },
              { key: "wfh", header: "WFH", align: "right", hideOnMobile: true },
              { key: "lop", header: "LoP", align: "right", hideOnMobile: true },
            ]}
            rows={att.map(({ e, a }) => ({
              name: { v: e.name, href: `/employees/${encodeURIComponent(e.key)}${q({ employee: null })}` },
              section: e.section,
              sched: a.scheduledDays,
              present: a.presentDays,
              pct: { v: a.attendancePct, label: fmtPct(a.attendancePct, 1), tone: a.attendancePct != null && a.attendancePct < 80 ? "critical" : undefined },
              leave: a.leaveDays,
              wfh: a.wfhDays,
              lop: a.lopDays,
            }))}
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card id="upcoming">
          <CardHeader title="Upcoming leave" subtitle="Approved, next 30 days" />
          <CardBody>
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-muted">No approved leave in the next 30 days.</p>
            ) : (
              <ul className="flex max-h-[420px] flex-col overflow-y-auto">
                {upcoming.map((l) => (
                  <li key={l.workflowId} className="flex items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{ds.emp.get(l.employeeKey)?.name ?? l.employeeKey}</span>
                      <span className="text-[12px] text-ink-2">
                        {fmtRange(l.startDate!, l.endDate!)} · {l.requestKind.replace("Time Off - ", "")}
                      </span>
                    </span>
                    <Badge tone="accent">{l.leaveType}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card id="requests" className="xl:col-span-2">
          <CardHeader title="Leave requests" subtitle={`Leave Tracker · requests overlapping ${fmtRange(v.from, v.to)}, plus every pending request`} info="Effective = Approved and not reverted in Calendar View ('Revert Leave' / 'Leave Reverted'). Reverted leaves are not counted anywhere. 'Working' requests are work days that earn comp off: that day counts as a working day, not leave." />
          <CardBody>
            <DataTable
              filename="leave-requests"
              initialSort={{ key: "start", desc: true }}
              pageSize={10}
              columns={[
                { key: "id", header: "Workflow ID", hideOnMobile: true },
                { key: "who", header: "Employee" },
                { key: "type", header: "Type" },
                { key: "kind", header: "Request", hideOnMobile: true },
                { key: "start", header: "From" },
                { key: "end", header: "To", hideOnMobile: true },
                { key: "status", header: "Approval" },
                { key: "cal", header: "Calendar", hideOnMobile: true },
              ]}
              rows={[...new Map([...requests, ...pendingAll].map((l) => [l.workflowId, l])).values()].map((l) => ({
                id: l.workflowId,
                who: { v: ds.emp.get(l.employeeKey)?.name ?? l.employeeKey, href: `/employees/${encodeURIComponent(l.employeeKey)}${q({ employee: null })}` },
                type: l.leaveType,
                kind: l.requestKind.replace("Time Off - ", ""),
                start: { v: l.startDate, label: l.startDate ? fmtDate(l.startDate, true) : "—" },
                end: { v: l.endDate, label: l.endDate ? fmtDate(l.endDate, true) : "—" },
                status: { v: l.approvalStatus || "Pending", badge: true, tone: /^approved$/i.test(l.approvalStatus) ? (l.effective ? "good" : "muted") : /^declined$/i.test(l.approvalStatus) ? "critical" : "warning", label: /^approved$/i.test(l.approvalStatus) && !l.effective ? (isWorkingRequest(l.leaveType) ? "Approved · work day" : "Approved · reverted") : l.approvalStatus || "Pending" },
                cal: l.calendarStatus || "—",
              }))}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
