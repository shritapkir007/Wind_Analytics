// ISO date helpers (all dates are "YYYY-MM-DD" strings in IST).

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

export function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

/** Monday of the ISO week containing `iso`. */
export function weekStart(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export type Preset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

export const PRESET_LABELS: Record<Preset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  custom: "Custom range",
};

export function presetRange(p: Preset, today: string, custom?: { from?: string; to?: string }): { from: string; to: string } {
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "this_week":
      return { from: weekStart(today), to: today };
    case "last_week": {
      const s = addDays(weekStart(today), -7);
      return { from: s, to: addDays(s, 6) };
    }
    case "this_month":
      return { from: monthStart(today), to: today };
    case "last_month": {
      const s = monthStart(addDays(monthStart(today), -1));
      return { from: s, to: monthEnd(s) };
    }
    case "custom": {
      const ok = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
      const from = ok(custom?.from) ?? monthStart(today);
      const to = ok(custom?.to) ?? today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

/** The equal-length period immediately before [from, to]. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = diffDays(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]}${withYear ? ` ${y}` : ""}`;
}

export function fmtMonth(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export function fmtRange(from: string, to: string): string {
  if (from === to) return fmtDate(from, true);
  return `${fmtDate(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmtDate(to, true)}`;
}
