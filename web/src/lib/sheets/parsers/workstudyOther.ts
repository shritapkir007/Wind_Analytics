// Work Study workbook: "Active ZV" (team-level deliveries), "Target" (throughput targets),
// "Employee List" (roster cross-check) and the per-process pivot tabs (reconciliation).

import type { DeliveryDay, Issue, Stream, TargetRow } from "../../types";
import { targetKey } from "../../processes";
import { clean, normEmail, parseDayFirst, parseNumber, type Grid } from "../normalize";

const SRC = "workstudy";

/**
 * Active ZV: row 1 has the group labels ("Blade External" / "Blade Internal" / "ZDT…") and
 * row 5 the column headers. Each group starts with "Delivered/Day".
 */
export function parseActiveZv(grid: Grid): { days: DeliveryDay[]; issues: Issue[] } {
  const TAB = "Active ZV";
  const issues: Issue[] = [];
  const hr = grid.findIndex((row, i) => i < 10 && (row ?? []).some((c) => /^delivered\/day/i.test(clean(c))));
  if (hr < 0) throw new Error(`${TAB}: header row with "Delivered/Day" not found`);
  const header = grid[hr].map((c) => clean(c).toLowerCase());
  const dateCol = header.findIndex((c) => c === "date");
  const starts = header.map((c, i) => (c.startsWith("delivered/day") ? i : -1)).filter((i) => i >= 0);
  const groupLabel = (start: number): Stream | null => {
    for (let c = start; c >= 0; c--) {
      const g = clean(grid[0]?.[c]).toLowerCase();
      if (!g) continue;
      if (g.includes("external")) return "External";
      if (g.includes("internal")) return "Internal";
      if (g.includes("zdt") || g.includes("zero down")) return "ZDT";
    }
    return null;
  };
  const groups = starts.map((s, gi) => {
    const end = gi + 1 < starts.length ? starts[gi + 1] : header.length;
    const find = (re: RegExp) => {
      for (let c = s; c < end; c++) if (re.test(header[c])) return c;
      return -1;
    };
    return {
      stream: groupLabel(s),
      delivered: s,
      expected: find(/^expected/),
      uploaded: find(/^upload/),
      inventory: find(/inventory/),
      qi: find(/quality issue/),
      dup: find(/duplicate/),
      late: find(/late upload/),
      audit: find(/aud(i|o)t/),
    };
  });
  const days: DeliveryDay[] = [];
  for (const g of groups) {
    if (!g.stream) {
      issues.push({ source: SRC, tab: TAB, rowRef: "header", severity: "error", code: "unknown_group", message: `Cannot tell which stream column ${g.delivered + 1} belongs to` });
      continue;
    }
    for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const date = parseDayFirst(row[dateCol]);
      if (!date) continue;
      const n = (i: number) => (i >= 0 ? parseNumber(row[i]).value : 0);
      days.push({
        stream: g.stream,
        date,
        delivered: n(g.delivered),
        expected: n(g.expected),
        uploaded: n(g.uploaded),
        inventory: n(g.inventory),
        qualityIssues: n(g.qi),
        duplicates: n(g.dup),
        lateUploads: n(g.late),
        auditCount: n(g.audit),
      });
    }
  }
  return { days, issues };
}

export function parseTargets(grid: Grid): TargetRow[] {
  const hr = grid.findIndex((row) => clean(row?.[0]).toLowerCase() === "method");
  if (hr < 0) throw new Error(`Target: header row starting with "Method" not found`);
  const out: TargetRow[] = [];
  for (let r = hr + 1; r < grid.length; r++) {
    const [method, process, images, range, avg, mins] = (grid[r] ?? []).map((c) => clean(c));
    if (!method || !process) continue;
    const perDay = parseNumber(avg);
    const minutes = parseNumber(mins);
    out.push({
      key: targetKey(method, process),
      method,
      process,
      images: images ?? "",
      range: range ?? "",
      perDay: perDay.ok && perDay.value > 0 ? perDay.value : null,
      minutesPerWtg: minutes.ok && minutes.value > 0 ? minutes.value : null,
    });
  }
  return out;
}

/** "Employee List": emails present in the work-study roster (cross-check against Calendar View). */
export function parseEmployeeList(grid: Grid): { email: string; name: string; role: string }[] {
  const out: { email: string; name: string; role: string }[] = [];
  for (const row of grid) {
    const email = normEmail(row?.[1]);
    if (email) out.push({ email, name: clean(row[0]), role: clean(row[2]) });
  }
  return out;
}

/**
 * Per-process pivot tab (e.g. "Ext_FQC"): row 1 = emails from column E, row 2 = names,
 * then one row per date (column B). Returns value per "email|date" for reconciliation.
 */
export function parsePivot(grid: Grid): Map<string, number> {
  const out = new Map<string, number>();
  const emails = (grid[0] ?? []).map((c, i) => (i >= 4 ? normEmail(c) : null));
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const date = parseDayFirst(row[1]);
    if (!date) continue;
    emails.forEach((e, i) => {
      if (!e) return;
      const n = parseNumber(row[i]);
      if (n.ok && n.value !== 0) out.set(`${e}|${date}`, n.value);
    });
  }
  return out;
}
