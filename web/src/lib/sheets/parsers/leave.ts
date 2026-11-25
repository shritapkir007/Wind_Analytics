// Leave workbook: "Leave Tracker" (request log + lead/calendar status), "Tracker" (raw Slack log,
// reconciliation only) and "Dashboard" (summary cards, reconciliation only).

import type { Issue, LeaveRequest, Reference } from "../../types";
import { clean, headerIndex, normEmail, parseDayFirst, parseSlackTimestamp, type Grid } from "../normalize";

const SRC = "leave";

function findHeaderRow(grid: Grid, mustHave: string): number {
  for (let r = 0; r < Math.min(grid.length, 6); r++) {
    if ((grid[r] ?? []).some((c) => clean(c).toLowerCase() === mustHave.toLowerCase())) return r;
  }
  return -1;
}

/** Request type "Working": the person works that day to earn comp off. */
export function isWorkingRequest(leaveType: string): boolean {
  return /^working$/i.test(clean(leaveType));
}

export function isReverted(calendarStatus: string, calendarComment: string): boolean {
  return /revert/i.test(calendarStatus) || /revert/i.test(calendarComment);
}

export function parseLeaveTracker(grid: Grid): { requests: LeaveRequest[]; issues: Issue[] } {
  const TAB = "Leave Tracker";
  const issues: Issue[] = [];
  const h = findHeaderRow(grid, "Workflow ID");
  if (h < 0) throw new Error(`${TAB}: header row with "Workflow ID" not found`);
  const header = grid[h].map((x) => clean(x));
  const ix = (...n: string[]) => headerIndex(header, ...n);
  const c = {
    id: ix("Workflow ID"),
    from: ix("Request from"),
    request: ix("Request"),
    type: ix("Request Type"),
    start: ix("Start Date"),
    end: ix("End Date"),
    comment: ix("Comment"),
    slack: ix("Slack Message"),
    applied: ix("Application Time Stamp"),
    status: ix("Approval Status"),
    reviewed: ix("Reviewed by"),
    lead: ix("Leads Comment"),
    closed: ix("Closures Time Stamp"),
    calStatus: ix("Status With Calendar View"),
    calComment: ix("Comment from Calendar View"),
    zoho: ix("Zoho Applied ?"),
    manager: header.findIndex((x) => /manager'?s note/i.test(x)),
  };
  const get = (row: string[], i: number) => (i >= 0 ? clean(row[i]) : "");
  const requests: LeaveRequest[] = [];
  const seen = new Set<string>();
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const id = get(row, c.id);
    if (!id) continue;
    const rowRef = `row ${r + 1} · ${id}`;
    if (seen.has(id)) {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "error", code: "duplicate_workflow", message: `Workflow ID ${id} appears more than once; first row used` });
      continue;
    }
    seen.add(id);
    const email = normEmail(get(row, c.from));
    if (!email) {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "error", code: "bad_email", message: `"${get(row, c.from)}" is not an email; request skipped` });
      continue;
    }
    const startDate = parseDayFirst(get(row, c.start));
    const endDate = parseDayFirst(get(row, c.end)) ?? startDate;
    if (!startDate) {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "warning", code: "bad_date", message: `Start Date "${get(row, c.start)}" is not a valid date` });
    } else if (endDate && endDate < startDate) {
      issues.push({ source: SRC, tab: TAB, rowRef, severity: "warning", code: "end_before_start", message: `End Date ${endDate} is before Start Date ${startDate}` });
    }
    const approvalStatus = get(row, c.status);
    const calendarStatus = get(row, c.calStatus);
    const calendarComment = get(row, c.calComment);
    requests.push({
      workflowId: id,
      employeeKey: email,
      requestKind: get(row, c.request),
      leaveType: get(row, c.type),
      startDate,
      endDate,
      comment: get(row, c.comment),
      appliedAt: parseSlackTimestamp(get(row, c.applied)),
      closedAt: parseSlackTimestamp(get(row, c.closed)),
      approvalStatus,
      reviewedBy: get(row, c.reviewed),
      leadComment: get(row, c.lead),
      calendarStatus,
      calendarComment,
      zohoApplied: get(row, c.zoho),
      managerNote: get(row, c.manager),
      slackUrl: get(row, c.slack),
      // "Working" = working a day (e.g. a weekend) to earn comp off: not leave (decision 25 Nov).
      effective: /^approved$/i.test(approvalStatus) && !isReverted(calendarStatus, calendarComment) && !isWorkingRequest(get(row, c.type)),
    });
  }
  return { requests, issues };
}

/** Raw "Tracker" tab: only the set of Workflow IDs is used, to reconcile with "Leave Tracker". */
export function parseTrackerIds(grid: Grid): Set<string> {
  const h = findHeaderRow(grid, "Workflow ID");
  const ids = new Set<string>();
  if (h < 0) return ids;
  const c = headerIndex(grid[h], "Workflow ID");
  for (let r = h + 1; r < grid.length; r++) {
    const id = clean(grid[r]?.[c]);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * "Dashboard" summary cards. Each card is a label cell with its number two rows below
 * (e.g. "Total Leave Requests" -> 1975). Returned as references for reconciliation.
 */
export function parseLeaveDashboard(grid: Grid): Reference[] {
  // Only the summary-card row (the one holding "Total Leave Requests") is read. The tab also has
  // side tables whose headings repeat ("Total Leaves", "count Workflow ID"); those are ignored.
  const r = grid.findIndex((row, i) => i < 30 && (row ?? []).some((c) => /total\s*leave\s*requests/i.test(clean(c))));
  if (r < 0) return [];
  const out = new Map<string, number>();
  (grid[r] ?? []).forEach((cell, col) => {
    const label = clean(cell);
    if (!label || /^\d/.test(label)) return;
    for (const dr of [1, 2]) {
      const v = clean(grid[r + dr]?.[col]);
      if (/^\d+$/.test(v)) {
        const key = `leaveDashboard.${label}`;
        if (!out.has(key)) out.set(key, Number(v));
        break;
      }
    }
  });
  return [...out].map(([key, value]) => ({ key, value }));
}
