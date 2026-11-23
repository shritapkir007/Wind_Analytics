// OT workbook: "Wind OT tracker 2026" (weekend/overtime work) and "Employee ID" (FW codes).

import type { Issue, OvertimeEntry } from "../../types";
import { clean, hashOf, headerIndex, nameKey, normEmail, parseDayFirst, sumNumbersInText, type Grid } from "../normalize";

const SRC = "overtime";

export function parseEmployeeIds(grid: Grid): { code: string; name: string; email: string | null; role: string }[] {
  const out: { code: string; name: string; email: string | null; role: string }[] = [];
  for (const row of grid) {
    const code = clean(row?.[0]);
    if (!/^[A-Z]{1,4}\d{2,}$/i.test(code)) continue;
    out.push({ code: code.toUpperCase(), name: clean(row[1]), email: normEmail(row[2]), role: clean(row[3]) });
  }
  return out;
}

/**
 * @param resolveName maps an analyst name (as typed in the OT tracker) to an employee key.
 */
export function parseOvertime(
  grid: Grid,
  resolveName: (name: string, employeeCode: string) => string | null,
): { entries: OvertimeEntry[]; issues: Issue[] } {
  const TAB = "Wind OT tracker 2026";
  const issues: Issue[] = [];
  const header = (grid[0] ?? []).map((c) => clean(c));
  const ix = (...n: string[]) => headerIndex(header, ...n);
  const c = {
    name: ix("Analyst Name"),
    role: ix("Role"),
    location: ix("Location"),
    process: ix("Operational Process"),
    dept: ix("Supporting department"),
    date: ix("Date"),
    start: ix("Time Start"),
    end: ix("Time ends"),
    shift: header.findIndex((h) => /^shift/i.test(h)),
    turbines: header.findIndex((h) => /turbines/i.test(h)),
    supervisor: ix("Supervisor name"),
    code: ix("Employee ID"),
  };
  if (c.name < 0 || c.date < 0) throw new Error(`${TAB}: header must contain "Analyst Name" and "Date"`);
  const get = (row: string[], i: number) => (i >= 0 ? clean(row[i]) : "");
  const entries: OvertimeEntry[] = [];
  const unmatched = new Set<string>();
  const keyCount = new Map<string, number>();
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = get(row, c.name);
    if (!name) continue;
    const date = parseDayFirst(get(row, c.date));
    if (!date) {
      issues.push({ source: SRC, tab: TAB, rowRef: `row ${r + 1}`, severity: "warning", code: "bad_date", message: `Date "${get(row, c.date)}" is not valid; row skipped` });
      continue;
    }
    const employeeKey = resolveName(name, get(row, c.code));
    if (!employeeKey && !unmatched.has(nameKey(name))) {
      unmatched.add(nameKey(name));
      issues.push({ source: SRC, tab: TAB, rowRef: `row ${r + 1}`, severity: "warning", code: "unmatched_name", message: `"${name}" does not match anyone in Calendar View or Employee ID` });
    }
    const shift = get(row, c.shift);
    const turbinesText = get(row, c.turbines);
    const process = get(row, c.process);
    const base = hashOf([nameKey(name), date, process, get(row, c.start)]);
    const n = (keyCount.get(base) ?? 0) + 1;
    keyCount.set(base, n);
    entries.push({
      rowKey: n === 1 ? base : `${base}-${n}`,
      employeeKey,
      analystName: name,
      date,
      process,
      department: get(row, c.dept),
      location: get(row, c.location),
      timeStart: get(row, c.start),
      timeEnd: get(row, c.end),
      shift,
      shiftWeight: /half/i.test(shift) ? 0.5 : shift ? 1 : 0,
      turbinesText,
      turbinesParsed: sumNumbersInText(turbinesText),
      supervisor: get(row, c.supervisor),
    });
  }
  return { entries, issues };
}
