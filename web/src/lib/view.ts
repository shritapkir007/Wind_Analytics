// Helpers shared by pages: URL filter parsing and number formatting.
import { FAMILIES, type Family } from "./processes";
import { presetRange, type Preset, PRESET_LABELS } from "./domain/dates";
import type { Grain } from "./domain/metrics";

export type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export interface ViewFilter {
  preset: Preset;
  from: string;
  to: string;
  section?: string;
  employee?: string;
  family?: Family;
  grain: Grain;
  q?: string;
}

export function parseView(sp: SP, today: string, defaultPreset: Preset = "this_month"): ViewFilter {
  const p = one(sp.preset) as Preset | undefined;
  const preset: Preset = p && p in PRESET_LABELS ? p : one(sp.from) ? "custom" : defaultPreset;
  const { from, to } = presetRange(preset, today, { from: one(sp.from), to: one(sp.to) });
  const fam = one(sp.family) as Family | undefined;
  const g = one(sp.grain);
  return {
    preset,
    from,
    to,
    section: one(sp.section) || undefined,
    employee: one(sp.employee) || undefined,
    family: fam && FAMILIES.includes(fam) ? fam : undefined,
    grain: g === "week" || g === "month" ? g : "day",
    q: one(sp.q) || undefined,
  };
}

/** Rebuild a query string, keeping the global filter and overriding some keys. */
export function qs(sp: SP, over: Record<string, string | undefined | null> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s) u.set(k, s);
  }
  for (const [k, v] of Object.entries(over)) {
    if (v == null || v === "") u.delete(k);
    else u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

const nf0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function fmtNum(n: number | null | undefined, digits?: 0 | 1 | 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const d = digits ?? (Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  return (d === 0 ? nf0 : d === 1 ? nf1 : nf2).format(n);
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100_000) return `${nf1.format(n / 1000)}K`;
  return fmtNum(n);
}

export function fmtPct(n: number | null | undefined, digits: 0 | 1 = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(digits ? nf1 : nf0).format(n)}%`;
}

export const FAMILY_COLOR: Record<Family, string> = {
  "Blade External": "var(--s1)",
  "Blade Internal": "var(--s2)",
  ZDT: "var(--s3)",
  "Data Process": "var(--s4)",
  "Turbine Inspection": "var(--s5)",
  Uploads: "var(--s6)",
  Audit: "var(--s7)",
  Other: "var(--s8)",
};

/** Delivery streams reuse the colour of their family so a stream looks the same everywhere. */
export const STREAM_COLOR = { External: "var(--s1)", Internal: "var(--s2)", ZDT: "var(--s3)" } as const;
