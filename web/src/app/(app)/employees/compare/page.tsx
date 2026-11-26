import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadPage } from "@/lib/page";
import { FilterBar } from "@/components/filter-bar";
import { Card, CardBody, CardHeader, Empty, PageHeader, Swatch, btn } from "@/components/ui";
import { LineTrend } from "@/components/charts";
import { employeePerformance, outputSeries } from "@/lib/domain/metrics";
import { diffDays, fmtDate, fmtMonth, fmtRange } from "@/lib/domain/dates";
import { fmtNum, fmtPct, qs, type SP } from "@/lib/view";
import { FormulaCard } from "@/components/formula-card";

import { teamLabel } from "@/lib/teams";
export const dynamic = "force-dynamic";
const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

export default async function Compare({ searchParams }: { searchParams: Promise<SP> }) {
  const { ds, sp, v, filter, barProps } = await loadPage(searchParams);
  const list = (x: string | string[] | undefined) => (Array.isArray(x) ? x.join(",") : x ?? "");
  const raw = `${list(sp.ids)},${list(sp.p)}`;
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter((k) => ds.emp.has(k)))].slice(0, 4);
  const f = { ...filter, employee: undefined, section: undefined };
  const perf = ids.map((k) => employeePerformance(ds, k, f));
  const grain = diffDays(v.from, v.to) > 62 ? "month" : diffDays(v.from, v.to) > 20 ? "week" : "day";
  const series = ids.map((k) => outputSeries(ds, { ...f, employee: k }, grain));
  const cats = (series[0] ?? []).map((p) => (grain === "month" ? fmtMonth(p.bucket) : fmtDate(p.bucket)));
  const all = ds.employees.filter((e) => e.isActive).sort((a, b) => a.name.localeCompare(b.name));

  const rows: [string, (p: (typeof perf)[number]) => string, string?][] = [
    ["Team", (p) => teamLabel(p.employee.section)],
    ["Role", (p) => p.employee.role],
    ["Present days", (p) => fmtNum(p.attendance.presentDays, 1)],
    ["Attendance", (p) => fmtPct(p.attendance.attendancePct, 1)],
    ["Leave days", (p) => fmtNum(p.attendance.leaveDays, 1)],
    ["Days with output", (p) => fmtNum(p.daysWithOutput)],
    ["Target-days earned", (p) => fmtNum(p.output.targetDays, 1)],
    ["Productivity", (p) => fmtPct(p.productivityPct), "Target-days ÷ present days"],
    ["Target coverage", (p) => fmtPct(p.coveragePct), "Share of output in targeted processes"],
    ["Ranked?", (p) => (p.rankable ? "Yes" : "No — below coverage/day rule")],
    ["QI / rework resolved", (p) => fmtNum(p.output.reworkQty)],
    ["Present days without output", (p) => String(p.noOutputDays)],
    ["Main processes", (p) => Object.entries(p.output.byProcess).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => ds.processes.get(k)!.label).join(", ") || "—"],
  ];

  return (
    <div className="fade-in">
      <Link href={`/employees${qs(sp, { ids: null })}`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> All employees
      </Link>
      <PageHeader title="Compare employees" subtitle={`Same metrics and formulas for everyone · ${fmtRange(v.from, v.to)} · up to 4 people`} />
      <FilterBar {...barProps} />
      <Card className="mb-4">
        <CardHeader title="People to compare" />
        <CardBody>
          <form action="/employees/compare" className="flex flex-wrap items-end gap-2">
            {["preset", "from", "to"].map((k) => (typeof sp[k] === "string" ? <input key={k} type="hidden" name={k} value={sp[k] as string} /> : null))}
            {[0, 1, 2, 3].map((i) => (
              <label key={i} className="flex flex-col gap-1 text-[12px] text-ink-2">
                Person {i + 1}
                <select name="p" defaultValue={ids[i] ?? ""} className="h-9 min-w-[200px] rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
                  <option value="">—</option>
                  {all.map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button className={btn.primary} type="submit">
              Compare
            </button>
          </form>
        </CardBody>
      </Card>
      {ids.length === 0 ? (
        <Empty title="Pick at least one person" />
      ) : (
        <>
          <Card className="mb-4">
            <CardBody className="pt-5">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className="w-56 pb-2 text-left text-[12px] font-medium text-ink-2">Metric</th>
                      {perf.map((p, i) => (
                        <th key={p.employee.key} className="pb-2 text-left">
                          <Link href={`/employees/${encodeURIComponent(p.employee.key)}`} className="inline-flex items-center gap-2 font-semibold text-ink hover:text-accent">
                            <Swatch color={COLORS[i]} /> {p.employee.name}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label, fn, hint]) => (
                      <tr key={label} className="border-t border-line">
                        <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">
                          {label}
                          {hint && <span className="block text-[11.5px] text-muted">{hint}</span>}
                        </th>
                        {perf.map((p) => (
                          <td key={p.employee.key} className="tnum py-2 text-ink">
                            {fn(p)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          <Card className="mb-4">
            <CardHeader title="Productivity over time" subtitle={`Per ${grain}`} />
            <CardBody>
              <LineTrend categories={cats} series={perf.map((p, i) => ({ name: p.employee.name, color: COLORS[i], data: series[i].map((s) => (s.productivityPct == null ? null : Math.round(s.productivityPct))) }))} yName="%" refLine={{ value: 100, name: "100%" }} label="Productivity over time per person" />
            </CardBody>
          </Card>
        </>
      )}
      <FormulaCard />
    </div>
  );
}
