// Fetch every source tab and turn it into normalised records. No database access here.

import type {
  CalendarDay,
  DeliveryDay,
  Employee,
  Issue,
  LeaveRequest,
  OutputSubmission,
  OvertimeEntry,
  Reference,
  TargetRow,
} from "../types";
import type { WorkbookId } from "../config";
import type { SheetSource } from "../sheets/source";
import type { Grid } from "../sheets/normalize";
import { nameKey } from "../sheets/normalize";
import { parseCalendarView } from "../sheets/parsers/calendarView";
import { parseUserInput } from "../sheets/parsers/userInput";
import { parseLeaveDashboard, parseLeaveTracker, parseTrackerIds } from "../sheets/parsers/leave";
import { parseActiveZv, parseEmployeeList, parsePivot, parseTargets } from "../sheets/parsers/workstudyOther";
import { parseEmployeeIds, parseOvertime } from "../sheets/parsers/overtime";
import { PROCESSES } from "../processes";
import { applyWorkingRequests, fuzzyNameLookup, linkNamelessRows } from "./identity";
import { isActiveSection } from "../teams";
import { parsePipeline, parsePriority, type PipelineRow, type PrioritySiteRow } from "../sheets/parsers/inventory";
import { todayIST, WORKBOOKS } from "../config";

export interface Snapshot {
  employees?: Employee[];
  submissions?: OutputSubmission[];
  processColumns?: string[];
  calendar?: CalendarDay[];
  leave?: LeaveRequest[];
  delivery?: DeliveryDay[];
  targets?: TargetRow[];
  overtime?: OvertimeEntry[];
  pipeline?: PipelineRow[];
  priority?: PrioritySiteRow[];
  references: Reference[];
  issues: Issue[];
  /** Rows read per "workbook/tab". */
  read: Record<string, number>;
  /** Workbook-level or tab-level failures; the affected tables are left unchanged. */
  failures: Record<string, string>;
  /** Raw grids kept for reconciliation. */
  extra: { trackerIds?: Set<string>; pivots?: Record<string, Map<string, number>>; workstudyRoster?: { email: string; name: string }[] };
}

const PIVOT_TABS = new Set(PROCESSES.map((p) => p.column.toLowerCase()));

export async function collect(source: SheetSource, mode: "quick" | "full"): Promise<Snapshot> {
  const snap: Snapshot = { references: [], issues: [], read: {}, failures: {}, extra: {} };
  const grids: Partial<Record<WorkbookId, Record<string, Grid>>> = {};

  const tabsFor: Record<WorkbookId, string[]> = {
    workstudy: ["User Input", "Active ZV", "Target", "Employee List"],
    leave: ["Calendar View", "Leave Tracker", "Tracker", "Dashboard"],
    overtime: ["Wind OT tracker 2026", "Employee ID"],
    inventory: [...WORKBOOKS.inventory.tabs],
  };

  await Promise.all(
    (Object.keys(tabsFor) as WorkbookId[]).map(async (wb) => {
      try {
        const tabs = [...tabsFor[wb]];
        if (wb === "workstudy" && mode === "full") {
          const all = await source.listTabs(wb);
          for (const t of all) if (PIVOT_TABS.has(t.trim().toLowerCase())) tabs.push(t);
        }
        grids[wb] = await source.getTabs(wb, tabs);
        for (const [t, g] of Object.entries(grids[wb]!)) snap.read[`${wb}/${t}`] = g.length;
      } catch (e) {
        snap.failures[wb] = (e as Error).message;
      }
    }),
  );

  const guard = <T>(key: string, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (e) {
      snap.failures[key] = (e as Error).message;
      return undefined;
    }
  };

  // ---- Wind-Inventory Count: pipeline stages per tracker + priority sites ----
  const inv = grids.inventory;
  if (inv) {
    const p = guard("inventory/trackers", () => parsePipeline(inv, todayIST()));
    if (p) {
      snap.pipeline = p.rows;
      snap.issues.push(...p.issues);
    }
    snap.priority = guard("inventory/Priority", () => parsePriority(inv["Priority"]));
  }

  // ---- Leave workbook: roster + attendance + requests ----
  const lv = grids.leave;
  let roster: Employee[] | undefined;
  if (lv) {
    const cal = guard("leave/Calendar View", () => parseCalendarView(lv["Calendar View"]));
    if (cal) {
      roster = cal.employees;
      snap.calendar = cal.days;
      snap.references.push(...cal.references);
      snap.issues.push(...cal.issues);
    }
    const lt = guard("leave/Leave Tracker", () => parseLeaveTracker(lv["Leave Tracker"]));
    if (lt) {
      snap.leave = lt.requests;
      snap.issues.push(...lt.issues);
    }
    snap.extra.trackerIds = guard("leave/Tracker", () => parseTrackerIds(lv["Tracker"]));
    const dash = guard("leave/Dashboard", () => parseLeaveDashboard(lv["Dashboard"]));
    if (dash) snap.references.push(...dash);
  }

  // ---- OT workbook: employee codes first (needed for name matching) ----
  const ot = grids.overtime;
  const ids = ot ? guard("overtime/Employee ID", () => parseEmployeeIds(ot["Employee ID"])) : undefined;

  // ---- Work study workbook ----
  const ws = grids.workstudy;
  if (ws) {
    const ui = guard("workstudy/User Input", () => parseUserInput(ws["User Input"]));
    if (ui) {
      snap.submissions = ui.submissions;
      snap.processColumns = ui.processColumns;
      snap.issues.push(...ui.issues);
    }
    const zv = guard("workstudy/Active ZV", () => parseActiveZv(ws["Active ZV"]));
    if (zv) {
      snap.delivery = zv.days;
      snap.issues.push(...zv.issues);
    }
    snap.targets = guard("workstudy/Target", () => parseTargets(ws["Target"]));
    snap.extra.workstudyRoster = guard("workstudy/Employee List", () => parseEmployeeList(ws["Employee List"]));
    if (mode === "full") {
      const pivots: Record<string, Map<string, number>> = {};
      for (const [tab, g] of Object.entries(ws)) {
        if (!PIVOT_TABS.has(tab.trim().toLowerCase())) continue;
        const m = guard(`workstudy/${tab}`, () => parsePivot(g));
        if (m) pivots[PROCESSES.find((p) => p.column.toLowerCase() === tab.trim().toLowerCase())!.column] = m;
      }
      snap.extra.pivots = pivots;
    }
  }

  // ---- Employees: Calendar View is the roster (D8); others become "not in Calendar View" ----
  if (roster) {
    const byKey = new Map(roster.map((e) => [e.key, { ...e }]));
    for (const id of ids ?? []) {
      if (id.email && byKey.has(id.email)) byKey.get(id.email)!.employeeCode = id.code;
    }
    const wsNames = new Map((snap.extra.workstudyRoster ?? []).map((r) => [r.email, r.name]));
    const extraKeys = new Set<string>();
    for (const s of snap.submissions ?? []) if (!byKey.has(s.employeeKey)) extraKeys.add(s.employeeKey);
    for (const l of snap.leave ?? []) if (!byKey.has(l.employeeKey)) extraKeys.add(l.employeeKey);

    // Roster rows listed by name only (e.g. "Resigned/Layed OFF People") are linked to the email
    // their output / leave uses, when exactly one email matches the name.
    const nameless = [...byKey.values()].filter((e) => !e.email).map((e) => ({ key: e.key, name: e.name }));
    const links = linkNamelessRows(nameless, [...extraKeys]);
    for (const [oldKey, email] of links) {
      const e = byKey.get(oldKey)!;
      byKey.delete(oldKey);
      // Once linked to an email, people in a current section (e.g. LM Blade Pilot) are active;
      // Resigned / Department changed stay inactive.
      byKey.set(email, { ...e, key: email, email, isActive: isActiveSection(e.section), employeeCode: ids?.find((i) => i.email === email)?.code ?? e.employeeCode });
      for (const d of snap.calendar ?? []) if (d.employeeKey === oldKey) d.employeeKey = email;
      extraKeys.delete(email);
      snap.issues.push({ source: "leave", tab: "Calendar View", rowRef: e.name, severity: "info", code: "linked_by_name", message: `"${e.name}" (no email in Calendar View, section "${e.section}") linked to ${email} by name` });
    }
    for (const k of extraKeys) {
      const code = ids?.find((i) => i.email === k);
      byKey.set(k, {
        key: k,
        email: k,
        name: wsNames.get(k) || code?.name || k.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        role: code?.role ?? "",
        section: "Not in Calendar View",
        isActive: false,
        employeeCode: code?.code ?? null,
      });
      snap.issues.push({ source: "app", tab: "Employees", rowRef: k, severity: "warning", code: "unmatched_person", message: `${k} has output or leave records but is not in Calendar View` });
    }
    snap.employees = [...byKey.values()];
  }

  // ---- Approved "Working" requests turn that Week Off / holiday into a working day ----
  if (snap.calendar && snap.leave) {
    const n = applyWorkingRequests(snap.calendar, snap.leave);
    if (n) snap.issues.push({ source: "leave", tab: "Calendar View", rowRef: "summary", severity: "info", code: "working_requests_applied", message: `${n} Week Off / holiday day(s) counted as working days because of approved "Working" requests` });
  }

  // ---- Overtime (names -> employees via Calendar View names, Employee ID names and codes) ----
  if (ot && snap.employees) {
    const byName = new Map<string, string>();
    for (const e of snap.employees) byName.set(nameKey(e.name), e.key);
    for (const id of ids ?? []) if (id.email) byName.set(nameKey(id.name), id.email);
    for (const r of snap.extra.workstudyRoster ?? []) byName.set(nameKey(r.name), r.email);
    const byCode = new Map((ids ?? []).filter((i) => i.email).map((i) => [i.code, i.email!]));
    const people = snap.employees.map((e) => ({ key: e.key, name: e.name }));
    const res = guard("overtime/Wind OT tracker 2026", () =>
      parseOvertime(
        ot["Wind OT tracker 2026"],
        (name, code) => byCode.get(code.toUpperCase()) ?? byName.get(nameKey(name)) ?? fuzzyNameLookup(name, people),
      ),
    );
    if (res) {
      snap.overtime = res.entries;
      snap.issues.push(...res.issues);
    }
  }

  for (const [k, msg] of Object.entries(snap.failures)) {
    const [source, tab = "(workbook)"] = k.split("/");
    snap.issues.push({ source, tab, rowRef: "-", severity: "error", code: "sync_failed", message: msg });
  }
  return snap;
}
