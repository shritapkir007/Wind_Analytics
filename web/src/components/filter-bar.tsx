"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CalendarRange, Loader2, X } from "lucide-react";

const PRESETS: [string, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Custom range"],
];

const sel =
  "h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none";

export function FilterBar({
  preset,
  from,
  to,
  teams,
  employees,
  families,
  showFamily = false,
  showGrain = false,
  grain = "day",
  defaultPreset = "this_month",
}: {
  preset: string;
  from: string;
  to: string;
  teams: { team: string; subTeams: string[] }[];
  employees: { key: string; name: string }[];
  families?: string[];
  showFamily?: boolean;
  showGrain?: boolean;
  grain?: string;
  defaultPreset?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const set = (over: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(over)) {
      if (v == null || v === "") u.delete(k);
      else u.set(k, v);
    }
    start(() => router.replace(`${path}${u.toString() ? `?${u}` : ""}`, { scroll: false }));
  };
  const active = ["section", "employee", "family"].some((k) => sp.get(k)) || (sp.get("preset") && sp.get("preset") !== defaultPreset);

  return (
    <div className="no-print mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-card" role="search" aria-label="Filters">
      <CalendarRange size={16} className="text-muted" aria-hidden />
      <label className="sr-only" htmlFor="f-preset">
        Period
      </label>
      <select id="f-preset" className={sel} value={preset} onChange={(e) => set({ preset: e.target.value, from: e.target.value === "custom" ? from : null, to: e.target.value === "custom" ? to : null })}>
        {PRESETS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <>
          <label className="sr-only" htmlFor="f-from">
            From
          </label>
          <input id="f-from" type="date" className={sel} value={from} max={to} onChange={(e) => set({ preset: "custom", from: e.target.value })} />
          <span className="text-[12px] text-muted">to</span>
          <label className="sr-only" htmlFor="f-to">
            To
          </label>
          <input id="f-to" type="date" className={sel} value={to} min={from} onChange={(e) => set({ preset: "custom", to: e.target.value })} />
        </>
      )}
      <span className="mx-1 hidden h-5 w-px bg-line-strong sm:block" aria-hidden />
      <label className="sr-only" htmlFor="f-section">
        Team / section
      </label>
      <select id="f-section" className={sel} value={sp.get("section") ?? ""} onChange={(e) => set({ section: e.target.value || null, employee: null })}>
        <option value="">All teams</option>
        {teams.map((g) =>
          g.subTeams.length === 1 && g.subTeams[0] === g.team ? (
            <option key={g.team} value={g.team}>
              {g.team}
            </option>
          ) : (
            <optgroup key={g.team} label={g.team}>
              <option value={g.team}>All of {g.team}</option>
              {g.subTeams.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
      <label className="sr-only" htmlFor="f-employee">
        Employee
      </label>
      <select id="f-employee" className={`${sel} max-w-[220px]`} value={sp.get("employee") ?? ""} onChange={(e) => set({ employee: e.target.value || null })}>
        <option value="">All employees</option>
        {employees.map((e) => (
          <option key={e.key} value={e.key}>
            {e.name}
          </option>
        ))}
      </select>
      {showFamily && families && (
        <>
          <label className="sr-only" htmlFor="f-family">
            Work category
          </label>
          <select id="f-family" className={sel} value={sp.get("family") ?? ""} onChange={(e) => set({ family: e.target.value || null })}>
            <option value="">All work categories</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </>
      )}
      {showGrain && (
        <div className="ml-auto inline-flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Trend granularity">
          {(["day", "week", "month"] as const).map((g) => (
            <button key={g} type="button" onClick={() => set({ grain: g === "day" ? null : g })} aria-pressed={grain === g} className={`h-7 rounded-md px-2.5 text-[12px] font-medium capitalize ${grain === g ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2"}`}>
              {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      )}
      {pending && <Loader2 size={15} className="animate-spin text-muted" aria-label="Updating" />}
      {active && (
        <button type="button" onClick={() => set({ preset: null, from: null, to: null, section: null, employee: null, family: null })} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
          <X size={13} aria-hidden /> Reset
        </button>
      )}
    </div>
  );
}
