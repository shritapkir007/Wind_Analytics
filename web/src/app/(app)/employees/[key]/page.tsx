import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";
import { loadPage } from "@/lib/page";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CardBody, CardHeader, Empty, KpiCard, PageHeader } from "@/components/ui";
import { ColumnChart, LineTrend } from "@/components/charts";
import { DataTable } from "@/components/data-table";
import { isWorkingRequest } from "@/lib/sheets/parsers/leave";
import { LeaveCalendar } from "@/components/leave-calendar";
import { change, comparisonPeriod, employeePerformance, isOverdue, outputSeries, teamPerformance } from "@/lib/domain/metrics";
import { addDays, diffDays, fmtDate, fmtMonth, fmtRange, monthEnd, monthStart } from "@/lib/domain/dates";
import { FAMILIES } from "@/lib/processes";
import { FAMILY_COLOR, fmtNum, fmtPct, qs, type SP } from "@/lib/view";

import { teamLabel } from "@/lib/teams";
export const dynamic = "force-dynamic";

export default async function Profile({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SP> }) {
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  const { ds, sp, v, filter, barProps } = await loadPage(searchParams);
  const emp = ds.emp.get(key);
  if (!emp && !ds.submissions.some((s) => s.employeeKey === key)) notFound();
  const f = { ...filter, employee: undefined, section: undefined };
  const p = employeePerformance(ds, key, f);
  const cmp = comparisonPeriod(ds, f);
  const pp = employeePerformance(ds, key, { ...f, ...cmp });
  const ranked = teamPerformance(ds, f).filter((x) => x.rank != null);
  const me = ranked.find((x) => x.employee.key === key);

  // daily output by family (period, at least 30 days)
  const dF = diffDays(v.from, v.to) < 29 ? { from: addDays(v.to, -29), to: v.to } : { from: v.from, to: v.to };
  const series = outputSeries(ds, { ...dF, employee: key }, v.grain);
  const cats = series.map((s) => (v.grain === "month" ? fmtMonth(s.bucket) : fmtDate(s.bucket)));
  // year history by month
  const y = ds.today.slice(0, 4);
  const hist = outputSeries(ds, { from: `${y}-01-01`, to: ds.today, employee: key }, "month");
  const fams = FAMILIES.filter((fa) => series.some((s) => (s.byFamily[fa] ?? 0) > 0));

  const leaves = ds.leave.filter((l) => l.employeeKey === key).sort((a, b) => ((a.startDate ?? "") < (b.startDate ?? "") ? 1 : -1));
  const tasks = ds.tasks.filter((t) => t.assigneeKey === key);
  const subs = ds.submissions.filter((s) => s.employeeKey === key && s.date >= v.from && s.date <= v.to);
  const ot = ds.overtime.filter((o) => o.employeeKey === key);
  const byProc = Object.entries(p.output.byProcess).sort((a, b) => b[1] - a[1]);
  const back = qs(sp, {});

  return (
    <div className="fade-in">
      <Link href={`/employees${back}`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> All employees
      </Link>
      <PageHeader
        title={p.employee.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" dot={false}>
              {p.employee.role || "—"}
            </Badge>
            <Badge dot={false}>{p.employee.section ? teamLabel(p.employee.section) : "—"}</Badge>
            {p.employee.employeeCode && <Badge dot={false}>{p.employee.employeeCode}</Badge>}
            {!p.employee.isActive && <Badge tone="warning">Inactive / not in roster</Badge>}
            {p.employee.email && (
              <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-2">
                <Mail size={13} aria-hidden /> {p.employee.email}
              </span>
            )}
          </span>
        }
        actions={
          <Link href={`/employees/compare${qs(sp, { ids: key })}`} className="text-[13px] font-medium text-accent hover:underline">
            Compare with others
          </Link>
        }
      />
      <FilterBar {...barProps} showGrain />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Productivity" value={fmtPct(p.productivityPct)} sub={me ? `Rank #${me.rank} of ${ranked.length}` : "Not ranked (coverage or days below rule)"} delta={{ ...change(p.productivityPct, pp.productivityPct), label: `vs ${fmtRange(cmp.from, cmp.to)}`, suffix: " pts" }} tone={p.productivityPct != null && p.productivityPct < 80 ? "warning" : "default"} formula="Target-days earned ÷ present days × 100." />
        <KpiCard label="Target-days earned" value={fmtNum(p.output.targetDays, 1)} sub={`Coverage ${fmtPct(p.coveragePct)}`} delta={{ ...change(p.output.targetDays, pp.output.targetDays), label: "vs previous period" }} />
        <KpiCard label="Output" value={fmtNum(p.output.totalSteps)} unit="steps" sub={`${p.daysWithOutput} days logged · ${p.noOutputDays} present days without output`} delta={{ ...change(p.output.totalSteps, pp.output.totalSteps), label: "vs previous period" }} />
        <KpiCard label="Attendance" value={fmtPct(p.attendance.attendancePct, 1)} sub={`${fmtNum(p.attendance.presentDays, 1)} of ${p.attendance.scheduledDays} scheduled days · ${p.attendance.wfhDays} WFH`} />
        <KpiCard label="Leave days" value={fmtNum(p.attendance.leaveDays, 1)} sub={Object.entries(p.attendance.byLeaveType).map(([k, n]) => `${k} ${n}`).join(" · ") || "None in period"} />
        <KpiCard label="QI / rework resolved" value={fmtNum(p.output.reworkQty)} sub="QI Resolved & QI-Rework columns" />
        <KpiCard label="Open tasks" value={fmtNum(tasks.filter((t) => t.status !== "Completed").length)} sub={`${tasks.filter((t) => t.status === "Completed").length} completed · ${tasks.filter((t) => isOverdue(t, ds.today)).length} overdue`} tone={tasks.some((t) => isOverdue(t, ds.today)) ? "critical" : "default"} />
        <KpiCard label="Overtime days" value={fmtNum(ot.reduce((a, o) => a + o.shiftWeight, 0), 1)} sub={`${ot.length} entries in OT tracker`} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Output by work category" subtitle={`Per ${v.grain} · ${fmtRange(dF.from, dF.to)}`} />
          <CardBody>
            <ColumnChart categories={cats} series={fams.map((fa) => ({ name: fa, color: FAMILY_COLOR[fa], stack: "o", data: series.map((s) => Math.round((s.byFamily[fa] ?? 0) * 100) / 100) }))} label="Output by work category" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Processes worked" subtitle={fmtRange(v.from, v.to)} />
          <CardBody>
            {byProc.length === 0 ? (
              <Empty title="No output in this period" />
            ) : (
              <ul>
                {byProc.map(([proc, n]) => {
                  const info = ds.processes.get(proc)!;
                  return (
                    <li key={proc} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                      <span className="text-ink">{info.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[12px] text-muted">{info.counts ? `${fmtNum(n / info.target.perDay!, 1)} target-days` : "no target"}</span>
                        <span className="tnum font-medium text-ink">{fmtNum(n)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader title={`Historical performance · ${y}`} subtitle="Monthly productivity (target-days ÷ present days)" />
        <CardBody>
          <LineTrend categories={hist.map((h) => fmtMonth(h.bucket))} series={[{ name: "Productivity", color: "var(--s1)", data: hist.map((h) => (h.productivityPct == null ? null : Math.round(h.productivityPct))) }]} yName="%" refLine={{ value: 100, name: "100%" }} label="Monthly productivity" area />
        </CardBody>
      </Card>

      {emp && (
        <Card className="mb-4">
          <CardHeader title={`Attendance · ${fmtMonth(monthStart(v.to))}`} />
          <CardBody>
            <LeaveCalendar ds={ds} people={[emp]} from={monthStart(v.to)} to={monthEnd(v.to)} linkQs={back} />
          </CardBody>
        </Card>
      )}

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Leave history" subtitle="All requests in Leave Tracker" />
          <CardBody>
            <DataTable
              pageSize={8}
              filename={`leave-${key}`}
              columns={[
                { key: "from", header: "From" },
                { key: "to", header: "To" },
                { key: "type", header: "Type" },
                { key: "kind", header: "Request" },
                { key: "status", header: "Status" },
              ]}
              rows={leaves.map((l) => ({
                from: { v: l.startDate, label: l.startDate ? fmtDate(l.startDate, true) : "—" },
                to: { v: l.endDate, label: l.endDate ? fmtDate(l.endDate, true) : "—" },
                type: l.leaveType,
                kind: l.requestKind.replace("Time Off - ", ""),
                status: { v: l.approvalStatus || "Pending", badge: true, tone: l.effective ? "good" : /declined/i.test(l.approvalStatus) ? "critical" : /approved/i.test(l.approvalStatus) ? "muted" : "warning", label: /approved/i.test(l.approvalStatus) && !l.effective ? (isWorkingRequest(l.leaveType) ? "Work day" : "Reverted") : l.approvalStatus || "Pending" },
              }))}
              emptyText="No leave requests."
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tasks" subtitle="Assigned in this app" />
          <CardBody>
            <DataTable
              pageSize={8}
              filename={`tasks-${key}`}
              columns={[
                { key: "id", header: "ID" },
                { key: "title", header: "Task" },
                { key: "due", header: "Due" },
                { key: "status", header: "Status" },
              ]}
              rows={tasks.map((t) => ({
                id: `TSK-${String(t.id).padStart(4, "0")}`,
                title: t.title,
                due: { v: t.dueOn, label: t.dueOn ? fmtDate(t.dueOn, true) : "—", tone: isOverdue(t, ds.today) ? "critical" : undefined },
                status: { v: t.status, badge: true, tone: t.status === "Completed" ? "good" : isOverdue(t, ds.today) ? "critical" : "muted" },
              }))}
              emptyText="No tasks assigned."
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Daily output log" subtitle={`User Input entries · ${fmtRange(v.from, v.to)}`} />
        <CardBody>
          <DataTable
            filename={`output-${key}`}
            initialSort={{ key: "date", desc: true }}
            columns={[
              { key: "date", header: "Date" },
              { key: "cal", header: "Calendar" },
              { key: "work", header: "Processes" },
              { key: "td", header: "Target-days", align: "right" },
              { key: "note", header: "Notes" },
            ]}
            rows={subs.map((s) => {
              let td = 0;
              for (const [proc, n] of Object.entries(s.entries)) {
                const info = ds.processes.get(proc)!;
                if (info.counts) td += n / info.target.perDay!;
              }
              return {
                date: { v: s.date, label: fmtDate(s.date, true) },
                cal: ds.calendar.get(`${key}|${s.date}`)?.rawCode || "Working",
                work: Object.entries(s.entries).map(([proc, n]) => `${ds.processes.get(proc)!.label} ${n}`).join(" · ") || "—",
                td: Math.round(td * 100) / 100,
                note: [s.otherWork, s.leadNote].filter(Boolean).join(" · ") || "—",
              };
            })}
          />
        </CardBody>
      </Card>
    </div>
  );
}
