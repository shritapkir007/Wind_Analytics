import Link from "next/link";
import type { Dataset } from "@/lib/domain/metrics";
import { isPendingLeave } from "@/lib/domain/metrics";
import { eachDay, weekday } from "@/lib/domain/dates";
import type { Employee } from "@/lib/types";

export const CAL_LEGEND: { key: string; label: string; color: string; code: string }[] = [
  { key: "present", label: "Present", color: "var(--cal-present)", code: "" },
  { key: "wfh", label: "WFH", color: "var(--cal-wfh)", code: "W" },
  { key: "training", label: "Training", color: "var(--cal-training)", code: "T" },
  { key: "leave", label: "Approved leave", color: "var(--cal-leave)", code: "L" },
  { key: "half_leave", label: "Half-day leave", color: "var(--cal-half)", code: "½" },
  { key: "pending", label: "Pending leave", color: "var(--cal-pending)", code: "P" },
  { key: "absent", label: "Absent (LoP)", color: "var(--cal-absent)", code: "A" },
  { key: "week_off", label: "Week off", color: "var(--cal-off)", code: "" },
  { key: "holiday", label: "Holiday", color: "var(--cal-holiday)", code: "H" },
];
const BY_KEY = Object.fromEntries(CAL_LEGEND.map((l) => [l.key, l]));

/**
 * People × days matrix for one month. Colours and a letter code (so state is never colour-only).
 * "Pending leave" = a request not yet approved/declined covering a day the calendar shows as working.
 */
export function LeaveCalendar({ ds, people, from, to, linkQs }: { ds: Dataset; people: Employee[]; from: string; to: string; linkQs: string }) {
  const days = [...eachDay(from, to)];
  const pending = new Map<string, string>();
  for (const l of ds.leave) {
    if (!isPendingLeave(l) || !l.startDate || !l.endDate) continue;
    for (const d of eachDay(l.startDate < from ? from : l.startDate, l.endDate > to ? to : l.endDate)) pending.set(`${l.employeeKey}|${d}`, l.leaveType);
  }
  const state = (k: string, d: string) => {
    const c = ds.calendar.get(`${k}|${d}`);
    if (!c) return null;
    if (c.category === "lop") return "absent";
    if ((c.category === "present" || c.category === "wfh") && pending.has(`${k}|${d}`)) return "pending";
    if (c.category === "unknown") return "absent";
    return c.category;
  };
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
        {CAL_LEGEND.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[9px] font-semibold text-ink" style={{ background: l.color }} aria-hidden>
              {l.code}
            </span>
            {l.label}
          </li>
        ))}
      </ul>
      <div className="relative max-h-[560px] overflow-auto rounded-xl border border-line">
        <table className="border-separate border-spacing-0 text-[11px]">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 min-w-[170px] border-b border-line bg-surface-2 px-3 py-1.5 text-left text-[12px] font-medium text-ink-2">Employee</th>
              {days.map((d) => {
                const wd = weekday(d);
                return (
                  <th key={d} className={`sticky top-0 z-10 min-w-[26px] border-b border-line bg-surface-2 px-0 py-1 text-center font-medium ${d === ds.today ? "text-accent" : wd === 0 || wd === 6 ? "text-muted" : "text-ink-2"}`}>
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[9.5px] font-normal">{"SMTWTFS"[wd]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((e) => (
              <tr key={e.key}>
                <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-1 text-left text-[12px] font-medium whitespace-nowrap text-ink">
                  <Link href={`/employees/${encodeURIComponent(e.key)}${linkQs}`} className="hover:text-accent">
                    {e.name}
                  </Link>
                </th>
                {days.map((d) => {
                  const st = state(e.key, d);
                  const c = ds.calendar.get(`${e.key}|${d}`);
                  const leg = st ? BY_KEY[st] : null;
                  const title = `${e.name} · ${d} · ${st === "pending" ? `pending ${pending.get(`${e.key}|${d}`)} request` : c?.rawCode || (leg ? leg.label : "no record")}`;
                  return (
                    <td key={d} className={`border-b border-line p-[2px] ${d === ds.today ? "bg-accent-soft" : ""}`}>
                      <span title={title} className="flex h-[22px] w-[22px] items-center justify-center rounded-[4px] text-[9.5px] font-semibold text-ink" style={{ background: leg?.color ?? "transparent", outline: leg ? undefined : "1px dashed var(--border-strong)" }}>
                        {leg?.code}
                        <span className="sr-only">{title}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
