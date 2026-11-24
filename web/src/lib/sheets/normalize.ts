// Low-level value normalisation shared by every sheet parser.
// All dates in the app are ISO strings "YYYY-MM-DD"; all times are IST.

export type Cell = string | undefined | null;
export type Grid = string[][];

const ZERO_WIDTH = /[​-‍⁠﻿]/g;

export function clean(v: Cell): string {
  return (v ?? "").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

/** Canonical employee key from an email: lower-case, no zero-width chars, "+suffix" removed. */
export function normEmail(v: Cell): string | null {
  const s = clean(v).toLowerCase();
  const m = s.match(/^([^@\s+]+)(?:\+[^@\s]*)?@([^@\s]+\.[a-z]{2,})$/);
  return m ? `${m[1]}@${m[2]}` : null;
}

/** Name key used to match names across tabs (different spellings stay distinct). */
export function nameKey(v: Cell): string {
  return clean(v).toLowerCase().replace(/[^a-z]/g, "");
}

export function slug(v: Cell): string {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function iso(y: number, m: number, d: number): string | null {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // e.g. 31/02
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Day-first date: "02/01/2026" = 2 Jan 2026, "9/9/2026", "02-01-2026", optional time suffix.
 * Also accepts ISO "2026-01-02". Returns null when the value is not a valid date.
 */
export function parseDayFirst(v: Cell): string | null {
  const s = clean(v);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s|$)/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  return null;
}

/** "02/01/2026 15:12:09" (IST) -> ISO timestamp with +05:30 offset. */
export function parseDayFirstDateTime(v: Cell): string | null {
  const s = clean(v);
  const d = parseDayFirst(s);
  if (!d) return null;
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hh = t ? t[1].padStart(2, "0") : "00";
  const mm = t ? t[2] : "00";
  const ss = t?.[3] ?? "00";
  return `${d}T${hh}:${mm}:${ss}+05:30`;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Slack workflow timestamp: "December 31st, 2025 at 11:39 AM GMT+5:30". */
export function parseSlackTimestamp(v: Cell): string | null {
  const s = clean(v);
  const m = s.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?(?:\s*GMT([+-]\d{1,2})(?::?(\d{2}))?)?/i,
  );
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  const d = mon ? iso(+m[3], mon, +m[2]) : null;
  if (!d) return null;
  let h = +m[4];
  const ap = m[6]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const offH = m[7] ? +m[7] : 5;
  const offM = m[8] ? +m[8] : m[7] ? 0 : 30;
  const sign = offH < 0 || m[7]?.startsWith("-") ? "-" : "+";
  const off = `${sign}${String(Math.abs(offH)).padStart(2, "0")}:${String(offM).padStart(2, "0")}`;
  return `${d}T${String(h).padStart(2, "0")}:${m[5]}:00${off}`;
}

/** Numeric cell. Returns {value, ok}; blank = 0 (ok). Non-numeric text -> 0, ok=false. */
export function parseNumber(v: Cell): { value: number; ok: boolean } {
  const s = clean(v).replace(/,/g, "");
  if (s === "" || s === "-") return { value: 0, ok: true };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { value: Number(s), ok: true };
  return { value: 0, ok: false };
}

/** Sum of the numbers appearing in free text: "13 external prescreen and 2 analysis" -> 15. */
export function sumNumbersInText(v: Cell): number | null {
  const nums = clean(v).match(/\d+(?:\.\d+)?/g);
  return nums ? nums.reduce((a, n) => a + Number(n), 0) : null;
}

/** Find a header column by normalised name (case/space-insensitive). */
export function headerIndex(header: string[], ...names: string[]): number {
  const norm = (x: string) => clean(x).toLowerCase().replace(/[^a-z0-9+]/g, "");
  const h = header.map((x) => norm(x));
  for (const n of names) {
    const i = h.indexOf(norm(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Stable short hash of a JSON-able value (FNV-1a 32-bit). */
export function hashOf(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
