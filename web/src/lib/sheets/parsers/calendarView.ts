// "Calendar View" (Wind Leave Request Tracker) -> roster + one attendance record per person per day.
//
// Layout: row 1 = "Jan 1", "Jan 2", ... with month-label cells ("January") in between,
// row 2 = weekday, row 3 = headcount formula, row 4 = 93 - headcount, rows 5+ = people
// (A name, B email, C role). A row with only column A filled is a section header.

import type { CalendarDay, DayCategory, Employee, Issue, Reference } from "../../types";
import { clean, normEmail, slug, type Grid } from "../normalize";

const TAB = "Calendar View";
const SRC = "leave";
const INACTIVE_SECTIONS = [/resigned|layed off|laid off/i, /department changed/i];
const MON: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const LEAVE_CODES = ["el cf", "comp off", "el", "cl", "wl", "pl"];
/** Named leave types without a short code (decision 25 Nov: count as leave, own type). */
const NAMED_LEAVE: Record<string, string> = { bereavement: "Bereavement", "bereavement leave": "Bereavement", leave: "Leave" };

const leaveLabel = (code: string) => (code === "comp off" ? "Comp Off" : code.toUpperCase());

export function classifyCode(raw: string): {
  category: DayCategory;
  leaveType: string | null;
  presence: number | null;
} {
  const c = clean(raw)
    .toLowerCase()
    // common typos in the sheet: "Fisrt Half WL", "Frist Half CL", "Secound Half EL", "1st half …"
    .replace(/^(fisrt|frist|firts|1st)\b/, "first")
    .replace(/^(secound|seccond|secnd|2nd)\b/, "second")
    .replace(/\s+half\s+/, " half ");
  if (c === "" || c === "working") return { category: "present", leaveType: null, presence: 1 };
  if (c === "wfh") return { category: "wfh", leaveType: null, presence: 1 };
  if (c === "week off") return { category: "week_off", leaveType: null, presence: null };
  if (c === "public holiday" || c === "holiday") return { category: "holiday", leaveType: null, presence: null };
  // Decision 25 Nov: training days count as present for attendance but are left out of productivity.
  if (/\btraining\b/.test(c)) return { category: "training", leaveType: null, presence: 1 };
  if (/\b(lop|loss of pay)\b/.test(c)) return { category: "lop", leaveType: "LoP", presence: 0 };
  const half = c.match(/^(first|second) half (.+)$/);
  if (half && LEAVE_CODES.includes(half[2])) {
    // Decision 23 Nov: every half-day leave (incl. WL) = 0.5 present.
    return { category: "half_leave", leaveType: leaveLabel(half[2]), presence: 0.5 };
  }
  if (LEAVE_CODES.includes(c)) return { category: "leave", leaveType: leaveLabel(c), presence: 0 };
  if (NAMED_LEAVE[c]) return { category: "leave", leaveType: NAMED_LEAVE[c], presence: 0 };
  return { category: "unknown", leaveType: null, presence: 0 };
}

export interface CalendarResult {
  employees: Employee[];
  days: CalendarDay[];
  references: Reference[];
  issues: Issue[];
}

export function parseCalendarView(grid: Grid): CalendarResult {
  const issues: Issue[] = [];
  const title = clean(grid[0]?.[0]);
  const year = Number(title.match(/(20\d{2})/)?.[1] ?? NaN);
  if (!year) throw new Error(`${TAB}: cannot find the year in cell A1 ("${title}")`);

  // Column index -> ISO date.
  const dateCols: { col: number; date: string }[] = [];
  (grid[0] ?? []).forEach((cell, col) => {
    const m = clean(cell).match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2})$/);
    if (col < 3 || !m) return;
    const mon = MON[m[1].toLowerCase()];
    if (!mon) return;
    dateCols.push({ col, date: `${year}-${String(mon).padStart(2, "0")}-${m[2].padStart(2, "0")}` });
  });
  if (dateCols.length === 0) throw new Error(`${TAB}: no date columns ("Jan 1"…) found in row 1`);

  const references: Reference[] = [];
  for (const { col, date } of dateCols) {
    const v = Number(clean(grid[2]?.[col]));
    if (Number.isFinite(v) && clean(grid[2]?.[col]) !== "") references.push({ key: `calendar.headcount.${date}`, value: v });
  }

  const employees: Employee[] = [];
  const days: CalendarDay[] = [];
  const seen = new Map<string, number>();
  let section = "Wind Team";

  for (let r = 4; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = clean(row[0]);
    const emailRaw = clean(row[1]);
    const role = clean(row[2]);
    if (!name && !emailRaw) continue;
    if (name && !emailRaw && !role) {
      section = name;
      continue;
    }
    const email = normEmail(emailRaw);
    if (emailRaw && !email) {
      issues.push({ source: SRC, tab: TAB, rowRef: `row ${r + 1}`, severity: "warning", code: "bad_email", message: `Invalid email "${emailRaw}" for ${name}` });
    }
    const key = email ?? `name:${slug(name)}`;
    if (seen.has(key)) {
      issues.push({ source: SRC, tab: TAB, rowRef: `row ${r + 1}`, severity: "error", code: "duplicate_person", message: `${name} (${key}) is listed twice (rows ${seen.get(key)! + 1} and ${r + 1}); the first row is used` });
      continue;
    }
    seen.set(key, r);
    const inactiveSection = INACTIVE_SECTIONS.some((re) => re.test(section));
    if (inactiveSection && email) {
      issues.push({ source: SRC, tab: TAB, rowRef: `row ${r + 1}`, severity: "info", code: "inactive_with_email", message: `${name} is under "${section}" but still has an email; treated as inactive (the sheet's headcount formula still counts them)` });
    }
    employees.push({
      key,
      email,
      name,
      role,
      section,
      isActive: Boolean(email) && !inactiveSection,
      employeeCode: null,
    });

    for (const { col, date } of dateCols) {
      const raw = clean(row[col]);
      const c = classifyCode(raw);
      if (c.category === "unknown") {
        issues.push({ source: SRC, tab: TAB, rowRef: `${name} · ${date}`, severity: "warning", code: "unknown_code", message: `Unrecognised calendar code "${raw}" (counted as not present)` });
      }
      days.push({ employeeKey: key, date, rawCode: raw, ...c });
    }
  }
  return { employees, days, references, issues };
}
