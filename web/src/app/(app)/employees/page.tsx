import { loadPage } from "@/lib/page";
import { FilterBar } from "@/components/filter-bar";
import { ButtonLink, Card, CardBody, PageHeader } from "@/components/ui";
import { DataTable } from "@/components/data-table";
import { isOverdue, RANKING_RULES, teamPerformance } from "@/lib/domain/metrics";
import { fmtRange } from "@/lib/domain/dates";
import { fmtPct, qs, type SP } from "@/lib/view";
import { Scale } from "lucide-react";
import { FormulaCard } from "@/components/formula-card";

import { teamLabel } from "@/lib/teams";
export const dynamic = "force-dynamic";

export default async function Employees({ searchParams }: { searchParams: Promise<SP> }) {
  const { ds, sp, v, filter, barProps } = await loadPage(searchParams);
  const perf = teamPerformance(ds, filter);
  const openTasks = new Map<string, { open: number; overdue: number }>();
  for (const t of ds.tasks) {
    if (!t.assigneeKey || t.status === "Completed") continue;
    const r = openTasks.get(t.assigneeKey) ?? { open: 0, overdue: 0 };
    r.open++;
    if (isOverdue(t, ds.today)) r.overdue++;
    openTasks.set(t.assigneeKey, r);
  }
  const top = perf.filter((p) => p.rank != null).slice(0, 4).map((p) => p.employee.key);
  return (
    <div className="fade-in">
      <PageHeader title="Employee performance" subtitle={`Click a name for the full profile · ${fmtRange(v.from, v.to)}`} actions={<ButtonLink href={`/employees/compare${qs(sp, { ids: top.join(",") })}`}><Scale size={15} aria-hidden /> Compare employees</ButtonLink>} />
      <FilterBar {...barProps} />
      <Card className="mb-4">
        <CardBody className="pt-5">
          <DataTable
            filename="employee-performance"
            pageSize={25}
            initialSort={{ key: "rank" }}
            columns={[
              { key: "rank", header: "Rank", align: "right", width: 60 },
              { key: "name", header: "Employee" },
              { key: "section", header: "Team", hideOnMobile: true },
              { key: "role", header: "Role", hideOnMobile: true },
              { key: "code", header: "ID", hideOnMobile: true },
              { key: "present", header: "Present days", align: "right" },
              { key: "att", header: "Attendance", align: "right", hideOnMobile: true },
              { key: "td", header: "Target-days", align: "right" },
              { key: "prod", header: "Productivity", align: "right" },
              { key: "cov", header: "Coverage", align: "right", hideOnMobile: true },
              { key: "rework", header: "QI/rework", align: "right", hideOnMobile: true },
              { key: "noout", header: "Days w/o output", align: "right", hideOnMobile: true },
              { key: "tasks", header: "Open tasks", align: "right", hideOnMobile: true },
            ]}
            rows={perf.map((p) => {
              const t = openTasks.get(p.employee.key);
              return {
                rank: { v: p.rank, label: p.rank ? `#${p.rank}` : "—" },
                name: { v: p.employee.name, href: `/employees/${encodeURIComponent(p.employee.key)}${qs(sp, { employee: null })}` },
                section: teamLabel(p.employee.section),
                role: p.employee.role,
                code: p.employee.employeeCode,
                present: p.attendance.presentDays,
                att: { v: p.attendance.attendancePct, label: fmtPct(p.attendance.attendancePct, 1) },
                td: Math.round(p.output.targetDays * 100) / 100,
                prod: { v: p.productivityPct, label: fmtPct(p.productivityPct), badge: true, tone: p.productivityPct == null ? "muted" : p.productivityPct >= 100 ? "good" : p.productivityPct >= 80 ? "warning" : "critical" },
                cov: { v: p.coveragePct, label: fmtPct(p.coveragePct), tone: p.coveragePct != null && p.coveragePct < RANKING_RULES.minCoveragePct ? "muted" : undefined },
                rework: p.output.reworkQty,
                noout: { v: p.noOutputDays, tone: p.noOutputDays > 2 ? "warning" : undefined },
                tasks: { v: t?.open ?? 0, label: t ? `${t.open}${t.overdue ? ` (${t.overdue} overdue)` : ""}` : "0", tone: t?.overdue ? "critical" : undefined },
              };
            })}
          />
        </CardBody>
      </Card>
      <FormulaCard />
    </div>
  );
}
