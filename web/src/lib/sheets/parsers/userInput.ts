// "User Input" (Work Study) -> one submission per (employee, Output_Date) with per-process quantities.

import type { Issue, OutputSubmission } from "../../types";
import { isKnownProcess, processFor, USER_INPUT_META } from "../../processes";
import { clean, headerIndex, normEmail, parseDayFirst, parseDayFirstDateTime, parseNumber, type Grid } from "../normalize";

const TAB = "User Input";
const SRC = "workstudy";

export interface UserInputResult {
  submissions: OutputSubmission[];
  processColumns: string[];
  issues: Issue[];
}

export function parseUserInput(grid: Grid): UserInputResult {
  const issues: Issue[] = [];
  const header = (grid[0] ?? []).map((h) => clean(h));
  const col = {
    email: headerIndex(header, "Emplyoee Name", "Employee Name"),
    date: headerIndex(header, "Output_Date"),
    addedBy: headerIndex(header, "Data Added By"),
    ts: headerIndex(header, "Timestamp"),
    status: headerIndex(header, "Output Entry Status"),
    other: headerIndex(header, "Other_Work"),
    lead: headerIndex(header, "Team Lead's Notes"),
  };
  if (col.email < 0 || col.date < 0) throw new Error(`${TAB}: header row is missing "Emplyoee Name" or "Output_Date"`);

  const meta = new Set(USER_INPUT_META.map((m) => m.toLowerCase()));
  const processCols: { idx: number; column: string }[] = [];
  header.forEach((h, idx) => {
    if (h && !meta.has(h.toLowerCase())) processCols.push({ idx, column: processFor(h).column });
  });
  for (const p of processCols) {
    if (!isKnownProcess(p.column)) {
      issues.push({ source: SRC, tab: TAB, rowRef: "header", severity: "info", code: "new_process_column", message: `New process column "${p.column}" found; counted as output with no target` });
    }
  }

  const submissions: OutputSubmission[] = [];
  const seen = new Map<string, number>();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const rawEmail = clean(row[col.email]);
    const rawDate = clean(row[col.date]);
    if (!rawEmail && !rawDate) continue; // blank / totals row
    const rowRef = `row ${r + 1}`;
    const email = normEmail(rawEmail);
    const date = parseDayFirst(rawDate);
    if (!email) {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "error", code: "bad_email", message: `Row skipped: "${rawEmail}" is not an email` });
      continue;
    }
    if (!date) {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "error", code: "bad_date", message: `Row skipped: Output_Date "${rawDate}" is not a valid day-first date` });
      continue;
    }
    const k = `${email}|${date}`;
    if (seen.has(k)) {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "error", code: "duplicate_entry", message: `${email} already has an entry for ${date} (row ${seen.get(k)! + 1}); this repeat is not counted` });
      continue;
    }
    seen.set(k, r);

    const entries: Record<string, number> = {};
    for (const p of processCols) {
      const raw = row[p.idx];
      const n = parseNumber(raw);
      if (!n.ok) {
        issues.push({ source: SRC, tab: TAB, rowRef, severity: "warning", code: "non_numeric", message: `"${clean(raw)}" in ${p.column} is not a number; counted as 0` });
      }
      if (n.value < 0) {
        issues.push({ source: SRC, tab: TAB, rowRef, severity: "warning", code: "negative", message: `Negative value ${n.value} in ${p.column}; counted as 0` });
        continue;
      }
      if (n.value > 0) entries[p.column] = n.value;
    }
    const status = clean(row[col.status]);
    if (status && status.toLowerCase() !== "updated") {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "info", code: "entry_status", message: `Output Entry Status is "${status}" (still counted)` });
    }
    const addedBy = normEmail(row[col.addedBy]) ?? (clean(row[col.addedBy]) || null);
    const other = clean(row[col.other]);
    const lead = clean(row[col.lead]);
    submissions.push({
      employeeKey: email,
      date,
      submittedAt: col.ts >= 0 ? parseDayFirstDateTime(row[col.ts]) : null,
      addedBy,
      entryStatus: status,
      otherWork: other && other !== "0" ? other : null,
      leadNote: lead && lead !== "0" ? lead : null,
      sourceRow: r + 1,
      entries,
    });
  }
  return { submissions, processColumns: processCols.map((p) => p.column), issues };
}
