// KPI calculations. Pure functions over an in-memory Dataset; see docs/ARCHITECTURE.md §6.

import type { CalendarDay, DeliveryDay, Employee, LeaveRequest, OutputSubmission, OvertimeEntry, Stream, TargetRow } from "../types";
import { PROCESSES, processFor, resolveTarget, type Family, type ProcessDef, type ResolvedTarget } from "../processes";
import { addDays, eachDay, monthStart, previousPeriod, weekStart } from "./dates";

export interface Task {
  id: number;
  title: string;
  description: string;
  project: string;
  process: string | null;
  assigneeKey: string | null;
  assignedBy: string;
  priority: string;
  assignedOn: string;
  dueOn: string | null;
  completedOn: string | null;
  status: string;
  remarks: string;
  dependsOn: number[];
  updatedAt: string;
}

export interface ProcessInfo extends Omit<ProcessDef, "target"> {
  /** How the Target tab row is looked up. */
  lookup: ProcessDef["target"];
  target: ResolvedTarget;
  /** In productivity AND has a usable target value. */
  counts: boolean;
}

export interface Dataset {
  today: string;
  employees: Employee[];
  emp: Map<string, Employee>;
  submissions: OutputSubmission[];
  calendar: Map<string, CalendarDay>; // key|date
  calendarDates: string[]; // sorted
  leave: LeaveRequest[];
  delivery: DeliveryDay[];
  targets: TargetRow[];
  overtime: OvertimeEntry[];
  references: Map<string, number>;
  processes: Map<string, ProcessInfo>;
  processColumns: string[];
  tasks: Task[];
}

export function buildDataset(input: {
  today: string;
  employees: Employee[];
  submissions: OutputSubmission[];
  calendar: CalendarDay[];
  leave: LeaveRequest[];
  delivery: DeliveryDay[];
  targets: TargetRow[];
  overtime: OvertimeEntry[];
  references: { key: string; value: number }[];
  tasks: Task[];
}): Dataset {
  const cols = new Set<string>(PROCESSES.map((p) => p.column));
  for (const s of input.submissions) for (const c of Object.keys(s.entries)) cols.add(c);
  const processes = new Map<string, ProcessInfo>();
  for (const c of cols) {
    const def = processFor(c);
    const target = resolveTarget(def, input.targets);
    processes.set(c, { ...def, lookup: def.target, target, counts: def.inProductivity && target.perDay != null });
  }
  const calendar = new Map(input.calendar.map((d) => [`${d.employeeKey}|${d.date}`, d]));
  return {
    today: input.today,
    employees: input.employees,
    emp: new Map(input.employees.map((e) => [e.key, e])),
    submissions: [...input.submissions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    calendar,
    calendarDates: [...new Set(input.calendar.map((d) => d.date))].sort(),
    leave: input.leave,
    delivery: [...input.delivery].sort((a, b) => (a.date < b.date ? -1 : 1)),
    targets: input.targets,
    overtime: input.overtime,
    references: new Map(input.references.map((r) => [r.key, r.value])),
    processes,
    processColumns: [...cols],
    tasks: input.tasks,
  };
}

// ---------------------------------------------------------------------------------------------
// Filters

export interface Filter {
  from: string;
  to: string;
  section?: string;
  employee?: string; // employee key
  family?: Family;
}

export function employeesInScope(ds: Dataset, f: Pick<Filter, "section" | "employee">, includeInactive = false): Employee[] {
  return ds.employees.filter(
    (e) =>
      (includeInactive || e.isActive) &&
      (!f.section || e.section === f.section) &&
      (!f.employee || e.key === f.employee),
  );
}

const inRange = (d: string, f: { from: string; to: string }) => d >= f.from && d <= f.to;

/** Output rows within the filter. People outside the roster are kept unless a section is selected. */
export function submissionsInScope(ds: Dataset, f: Filter): OutputSubmission[] {
  return ds.submissions.filter((s) => {
    if (!inRange(s.date, f)) return false;
    if (f.employee && s.employeeKey !== f.employee) return false;
    if (f.section && ds.emp.get(s.employeeKey)?.section !== f.section) return false;
    return true;
  });
}

function entryIncluded(ds: Dataset, process: string, f: Filter) {
  return !f.family || ds.processes.get(process)?.family === f.family;
}

// ---------------------------------------------------------------------------------------------
// Attendance

export interface AttendanceSummary {
  scheduledDays: number; // working days (not week off / holiday), up to today
  presentDays: number; // Σ presence weight
  leaveDays: number; // full leave = 1, half = 0.5
  wfhDays: number;
  lopDays: number;
  attendancePct: number | null;
  byLeaveType: Record<string, number>;
}

export function attendanceFor(ds: Dataset, key: string, f: { from: string; to: string }): AttendanceSummary {
  const s: AttendanceSummary = { scheduledDays: 0, presentDays: 0, leaveDays: 0, wfhDays: 0, lopDays: 0, attendancePct: null, byLeaveType: {} };
  const to = f.to < ds.today ? f.to : ds.today;
  for (const d of eachDay(f.from, to)) {
    const c = ds.calendar.get(`${key}|${d}`);
    if (!c || c.presence === null) continue;
    s.scheduledDays++;
    s.presentDays += c.presence;
    if (c.category === "wfh") s.wfhDays++;
    if (c.category === "lop") s.lopDays++;
    if (c.category === "leave" || c.category === "half_leave") {
      const w = c.category === "half_leave" ? 0.5 : 1;
      s.leaveDays += w;
      s.byLeaveType[c.leaveType ?? "Other"] = (s.byLeaveType[c.leaveType ?? "Other"] ?? 0) + w;
    }
  }
  s.attendancePct = s.scheduledDays ? (s.presentDays / s.scheduledDays) * 100 : null;
  return s;
}

/** Effective (approved, not reverted) unplanned request covering `date`. */
function unplannedOn(ds: Dataset, key: string, date: string) {
  return ds.leave.find(
    (l) => l.employeeKey === key && l.effective && /unplanned/i.test(l.requestKind) && l.startDate && l.endDate && l.startDate <= date && date <= l.endDate,
  );
}

export interface DayStatusRow {
  employee: Employee;
  day: CalendarDay | undefined;
  status: "present" | "wfh" | "half_leave" | "leave" | "absent" | "week_off" | "holiday" | "unknown" | "no_record";
  leaveType: string | null;
  unplanned: boolean;
  outputLogged: boolean;
}

/** Status of every in-scope employee on one date. */
export function dayStatus(ds: Dataset, date: string, f: Pick<Filter, "section" | "employee"> = {}): DayStatusRow[] {
  const logged = new Set(ds.submissions.filter((s) => s.date === date).map((s) => s.employeeKey));
  return employeesInScope(ds, f).map((e) => {
    const day = ds.calendar.get(`${e.key}|${date}`);
    const unplanned = Boolean(unplannedOn(ds, e.key, date));
    let status: DayStatusRow["status"];
    if (!day) status = "no_record";
    else if (day.category === "lop") status = "absent";
    else if ((day.category === "leave" || day.category === "half_leave") && unplanned) status = day.category === "half_leave" ? "half_leave" : "absent";
    else status = day.category as DayStatusRow["status"];
    return { employee: e, day, status, leaveType: day?.leaveType ?? null, unplanned, outputLogged: logged.has(e.key) };
  });
}

export interface HeadcountSummary {
  date: string;
  active: number;
  present: number; // weighted (half day = 0.5), as the sheet computes it
  wfh: number;
  halfDay: number;
  onLeave: number; // people with a full or half leave code (planned)
  absent: number; // LoP or approved unplanned leave
  weekOff: number;
  holiday: number;
  noOutputLogged: number; // present but no User Input row
}

export function headcount(ds: Dataset, date: string, f: Pick<Filter, "section" | "employee"> = {}): HeadcountSummary {
  const rows = dayStatus(ds, date, f);
  const h: HeadcountSummary = { date, active: rows.length, present: 0, wfh: 0, halfDay: 0, onLeave: 0, absent: 0, weekOff: 0, holiday: 0, noOutputLogged: 0 };
  for (const r of rows) {
    const p = r.day?.presence ?? (r.status === "no_record" ? 0 : 0);
    if (r.day?.presence) h.present += p;
    if (r.status === "wfh") h.wfh++;
    if (r.status === "half_leave") h.halfDay++;
    if (r.status === "leave" || (r.status === "half_leave" && !r.unplanned)) h.onLeave++;
    if (r.status === "absent" || (r.status === "half_leave" && r.unplanned)) h.absent++;
    if (r.status === "week_off") h.weekOff++;
    if (r.status === "holiday") h.holiday++;
    if ((r.day?.presence ?? 0) > 0 && !r.outputLogged && date < ds.today) h.noOutputLogged++;
  }
  return h;
}

// ---------------------------------------------------------------------------------------------
// Output & productivity

export interface OutputSummary {
  totalSteps: number; // Σ qty over all processes ("WTG process-steps")
  byProcess: Record<string, number>;
  byFamily: Partial<Record<Family, number>>;
  targetDays: number; // Σ qty / target over counted processes
  targetedQty: number; // qty in counted processes
  untargetedQty: number;
  reworkQty: number;
  submissions: number;
  people: number;
}

export function outputSummary(ds: Dataset, f: Filter): OutputSummary {
  const o: OutputSummary = { totalSteps: 0, byProcess: {}, byFamily: {}, targetDays: 0, targetedQty: 0, untargetedQty: 0, reworkQty: 0, submissions: 0, people: 0 };
  const people = new Set<string>();
  for (const s of submissionsInScope(ds, f)) {
    let any = false;
    for (const [p, q] of Object.entries(s.entries)) {
      if (!entryIncluded(ds, p, f)) continue;
      const info = ds.processes.get(p)!;
      any = true;
      o.totalSteps += q;
      o.byProcess[p] = (o.byProcess[p] ?? 0) + q;
      o.byFamily[info.family] = (o.byFamily[info.family] ?? 0) + q;
      if (info.counts) {
        o.targetDays += q / info.target.perDay!;
        o.targetedQty += q;
      } else o.untargetedQty += q;
      if (info.rework) o.reworkQty += q;
    }
    if (any) {
      o.submissions++;
      people.add(s.employeeKey);
    }
  }
  o.people = people.size;
  return o;
}

export interface EmployeePerformance {
  employee: Employee;
  attendance: AttendanceSummary;
  output: OutputSummary;
  daysWithOutput: number;
  noOutputDays: number; // present working days (before today) with no User Input row
  productivityPct: number | null; // targetDays / presentDays
  coveragePct: number | null; // targetedQty / totalSteps
  rankable: boolean;
  rank: number | null;
}

export const RANKING_RULES = { minCoveragePct: 70, minPresentDays: 5 };

export function employeePerformance(ds: Dataset, key: string, f: Filter): EmployeePerformance {
  const employee = ds.emp.get(key) ?? { key, email: key, name: key, role: "", section: "", isActive: false, employeeCode: null };
  const scoped = { ...f, employee: key, section: undefined };
  const attendance = attendanceFor(ds, key, f);
  const output = outputSummary(ds, scoped);
  const subs = submissionsInScope(ds, scoped);
  const logged = new Set(subs.map((s) => s.date));
  let noOutputDays = 0;
  const to = f.to < ds.today ? f.to : addDays(ds.today, -1);
  for (const d of eachDay(f.from, to)) {
    const c = ds.calendar.get(`${key}|${d}`);
    if (c && (c.presence ?? 0) > 0 && !logged.has(d)) noOutputDays++;
  }
  const productivityPct = attendance.presentDays > 0 ? (output.targetDays / attendance.presentDays) * 100 : null;
  const coveragePct = output.totalSteps > 0 ? (output.targetedQty / output.totalSteps) * 100 : null;
  const rankable =
    productivityPct !== null && (coveragePct ?? 0) >= RANKING_RULES.minCoveragePct && attendance.presentDays >= RANKING_RULES.minPresentDays;
  return { employee, attendance, output, daysWithOutput: logged.size, noOutputDays, productivityPct, coveragePct, rankable, rank: null };
}

export function teamPerformance(ds: Dataset, f: Filter): EmployeePerformance[] {
  const keys = new Set(employeesInScope(ds, f).map((e) => e.key));
  if (!f.section && !f.employee) for (const s of submissionsInScope(ds, f)) keys.add(s.employeeKey);
  const rows = [...keys].map((k) => employeePerformance(ds, k, f));
  const ranked = rows.filter((r) => r.rankable).sort((a, b) => b.productivityPct! - a.productivityPct!);
  ranked.forEach((r, i) => (r.rank = i + 1));
  return rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.output.totalSteps - a.output.totalSteps);
}

export interface TeamTotals {
  presentDays: number;
  targetDays: number;
  productivityPct: number | null;
  /** Target vs actual restricted to person-days with targeted work (see §6.3). */
  targetQtyExpected: number;
  targetQtyActual: number;
  targetAchievementPct: number | null;
}

export function teamTotals(ds: Dataset, f: Filter): TeamTotals {
  const emps = employeesInScope(ds, f);
  let presentDays = 0;
  for (const e of emps) presentDays += attendanceFor(ds, e.key, f).presentDays;
  const out = outputSummary(ds, f);
  const pt = processTargets(ds, f);
  const expected = pt.reduce((a, r) => a + r.expectedQty, 0);
  const actual = pt.reduce((a, r) => a + r.actualQty, 0);
  return {
    presentDays,
    targetDays: out.targetDays,
    productivityPct: presentDays > 0 ? (out.targetDays / presentDays) * 100 : null,
    targetQtyExpected: expected,
    targetQtyActual: actual,
    targetAchievementPct: expected > 0 ? (actual / expected) * 100 : null,
  };
}

export interface ProcessTargetRow {
  process: string;
  label: string;
  family: Family;
  target: ResolvedTarget;
  actualQty: number;
  allocatedDays: number; // presence-days spent on this process
  expectedQty: number; // target × allocated days
  achievementPct: number | null;
}

/**
 * Target vs actual per counted process. A person-day's presence weight is split across the
 * processes logged that day in proportion to their target-day share.
 */
export function processTargets(ds: Dataset, f: Filter): ProcessTargetRow[] {
  const rows = new Map<string, ProcessTargetRow>();
  for (const s of submissionsInScope(ds, f)) {
    const c = ds.calendar.get(`${s.employeeKey}|${s.date}`);
    const w = c?.presence ?? 0; // output on off days earns credit but adds no expected work
    const shares: [string, number, ProcessInfo][] = [];
    let total = 0;
    for (const [p, q] of Object.entries(s.entries)) {
      const info = ds.processes.get(p)!;
      if (!info.counts || !entryIncluded(ds, p, f)) continue;
      const td = q / info.target.perDay!;
      shares.push([p, td, info]);
      total += td;
    }
    for (const [p, td, info] of shares) {
      const r = rows.get(p) ?? { process: p, label: info.label, family: info.family, target: info.target, actualQty: 0, allocatedDays: 0, expectedQty: 0, achievementPct: null };
      const q = s.entries[p];
      const alloc = total > 0 ? (w * td) / total : 0;
      r.actualQty += q;
      r.allocatedDays += alloc;
      r.expectedQty += alloc * info.target.perDay!;
      rows.set(p, r);
    }
  }
  for (const r of rows.values()) r.achievementPct = r.expectedQty > 0 ? (r.actualQty / r.expectedQty) * 100 : null;
  return [...rows.values()].sort((a, b) => b.actualQty - a.actualQty);
}

// ---------------------------------------------------------------------------------------------
// Time series

export type Grain = "day" | "week" | "month";

export function bucketOf(date: string, g: Grain): string {
  return g === "day" ? date : g === "week" ? weekStart(date) : monthStart(date);
}

export interface SeriesPoint {
  bucket: string;
  byFamily: Partial<Record<Family, number>>;
  total: number;
  targetDays: number;
  presentDays: number;
  productivityPct: number | null;
}

export function outputSeries(ds: Dataset, f: Filter, g: Grain): SeriesPoint[] {
  const map = new Map<string, SeriesPoint>();
  const get = (b: string) => {
    let p = map.get(b);
    if (!p) map.set(b, (p = { bucket: b, byFamily: {}, total: 0, targetDays: 0, presentDays: 0, productivityPct: null }));
    return p;
  };
  for (const d of eachDay(f.from, f.to)) get(bucketOf(d, g));
  for (const s of submissionsInScope(ds, f)) {
    const p = get(bucketOf(s.date, g));
    for (const [proc, q] of Object.entries(s.entries)) {
      if (!entryIncluded(ds, proc, f)) continue;
      const info = ds.processes.get(proc)!;
      p.total += q;
      p.byFamily[info.family] = (p.byFamily[info.family] ?? 0) + q;
      if (info.counts) p.targetDays += q / info.target.perDay!;
    }
  }
  const emps = employeesInScope(ds, f);
  const to = f.to < ds.today ? f.to : ds.today;
  for (const d of eachDay(f.from, to)) {
    const p = get(bucketOf(d, g));
    for (const e of emps) p.presentDays += ds.calendar.get(`${e.key}|${d}`)?.presence ?? 0;
  }
  for (const p of map.values()) p.productivityPct = p.presentDays > 0 ? (p.targetDays / p.presentDays) * 100 : null;
  return [...map.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}

export function attendanceSeries(ds: Dataset, f: Filter, g: Grain) {
  const emps = employeesInScope(ds, f);
  const map = new Map<string, { bucket: string; scheduled: number; present: number; leave: number; wfh: number; absent: number }>();
  const to = f.to < ds.today ? f.to : ds.today;
  for (const d of eachDay(f.from, to)) {
    const b = bucketOf(d, g);
    const p = map.get(b) ?? { bucket: b, scheduled: 0, present: 0, leave: 0, wfh: 0, absent: 0 };
    for (const e of emps) {
      const c = ds.calendar.get(`${e.key}|${d}`);
      if (!c || c.presence === null) continue;
      p.scheduled++;
      p.present += c.presence;
      if (c.category === "wfh") p.wfh++;
      if (c.category === "leave") p.leave++;
      if (c.category === "half_leave") p.leave += 0.5;
      if (c.category === "lop") p.absent++;
    }
    map.set(b, p);
  }
  return [...map.values()].map((p) => ({ ...p, attendancePct: p.scheduled ? (p.present / p.scheduled) * 100 : null }));
}

// ---------------------------------------------------------------------------------------------
// Deliveries (Active ZV)

export interface StreamSummary {
  stream: Stream;
  delivered: number;
  uploaded: number;
  duplicates: number;
  lateUploads: number;
  auditCount: number;
  inventory: number; // on `asOf`
  qualityIssues: number; // on `asOf`
  asOf: string | null;
  deliveryRatePct: number | null;
}

const hasActivity = (d: DeliveryDay) => d.delivered > 0 || d.uploaded > 0 || d.inventory > 0 || d.qualityIssues > 0;

export function deliverySummary(ds: Dataset, f: { from: string; to: string }): StreamSummary[] {
  const streams: Stream[] = ["External", "Internal", "ZDT"];
  return streams.map((stream) => {
    const rows = ds.delivery.filter((d) => d.stream === stream);
    const inP = rows.filter((d) => inRange(d.date, f));
    const last = [...rows].reverse().find((d) => d.date <= f.to && hasActivity(d)) ?? null;
    const sum = (k: keyof DeliveryDay) => inP.reduce((a, d) => a + (d[k] as number), 0);
    const delivered = sum("delivered");
    const inventory = last?.inventory ?? 0;
    return {
      stream,
      delivered,
      uploaded: sum("uploaded"),
      duplicates: sum("duplicates"),
      lateUploads: sum("lateUploads"),
      auditCount: sum("auditCount"),
      inventory,
      qualityIssues: last?.qualityIssues ?? 0,
      asOf: last?.date ?? null,
      deliveryRatePct: delivered + inventory > 0 ? (delivered / (delivered + inventory)) * 100 : null,
    };
  });
}

export function deliverySeries(ds: Dataset, f: { from: string; to: string }, g: Grain) {
  const map = new Map<string, Record<string, number> & { bucket: string }>();
  for (const d of ds.delivery) {
    if (!inRange(d.date, f)) continue;
    const b = bucketOf(d.date, g);
    const p = map.get(b) ?? ({ bucket: b } as Record<string, number> & { bucket: string });
    p[`${d.stream}.delivered`] = (p[`${d.stream}.delivered`] ?? 0) + d.delivered;
    p[`${d.stream}.uploaded`] = (p[`${d.stream}.uploaded`] ?? 0) + d.uploaded;
    p[`${d.stream}.duplicates`] = (p[`${d.stream}.duplicates`] ?? 0) + d.duplicates;
    if (hasActivity(d)) {
      // Stock measures: keep the last working day's value in the bucket.
      p[`${d.stream}.inventory`] = d.inventory;
      p[`${d.stream}.qualityIssues`] = d.qualityIssues;
    }
    map.set(b, p);
  }
  return [...map.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// Leave

export function leaveRequestsInRange(ds: Dataset, f: Filter) {
  return ds.leave.filter(
    (l) =>
      l.startDate &&
      l.endDate &&
      l.startDate <= f.to &&
      l.endDate >= f.from &&
      (!f.employee || l.employeeKey === f.employee) &&
      (!f.section || ds.emp.get(l.employeeKey)?.section === f.section),
  );
}

export function upcomingLeave(ds: Dataset, f: Pick<Filter, "section" | "employee">, days = 30) {
  const end = addDays(ds.today, days);
  return ds.leave
    .filter(
      (l) =>
        l.effective &&
        l.startDate &&
        l.startDate > ds.today &&
        l.startDate <= end &&
        (!f.employee || l.employeeKey === f.employee) &&
        (!f.section || ds.emp.get(l.employeeKey)?.section === f.section),
    )
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
}

export function leaveStatusCounts(ds: Dataset, f?: Filter) {
  const rows = f ? leaveRequestsInRange(ds, f) : ds.leave;
  const c: Record<string, number> = {};
  for (const l of rows) c[l.approvalStatus || "(blank)"] = (c[l.approvalStatus || "(blank)"] ?? 0) + 1;
  return c;
}

export const isPendingLeave = (l: LeaveRequest) => !/^(approved|declined)$/i.test(l.approvalStatus);

// ---------------------------------------------------------------------------------------------
// Tasks

export const TASK_STATUSES = ["Not Started", "In Progress", "Pending", "Under Review", "On Hold", "Completed"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export function isOverdue(t: Task, today: string) {
  return t.status !== "Completed" && t.dueOn != null && t.dueOn < today;
}

export function taskSummary(ds: Dataset, f: Pick<Filter, "employee" | "section">) {
  const ts = ds.tasks.filter(
    (t) => (!f.employee || t.assigneeKey === f.employee) && (!f.section || (t.assigneeKey && ds.emp.get(t.assigneeKey)?.section === f.section)),
  );
  const byStatus: Record<string, number> = {};
  for (const t of ts) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  return {
    total: ts.length,
    open: ts.filter((t) => t.status !== "Completed").length,
    inProgress: byStatus["In Progress"] ?? 0,
    completed: byStatus["Completed"] ?? 0,
    overdue: ts.filter((t) => isOverdue(t, ds.today)).length,
    byStatus,
    tasks: ts,
  };
}

// ---------------------------------------------------------------------------------------------
// Comparison helper

export function change(cur: number | null, prev: number | null) {
  if (cur == null || prev == null) return { abs: null, pct: null };
  return { abs: cur - prev, pct: prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null };
}

/** A working day = at least half of the active roster was scheduled (not week off / holiday). */
export function isWorkingDay(ds: Dataset, d: string): boolean {
  let scheduled = 0;
  let total = 0;
  for (const e of ds.employees) {
    if (!e.isActive) continue;
    const c = ds.calendar.get(`${e.key}|${d}`);
    if (!c) continue;
    total++;
    if (c.presence !== null) scheduled++;
  }
  return total > 0 && scheduled >= total / 2;
}

export function previousWorkingDay(ds: Dataset, before: string): string {
  let d = addDays(before, -1);
  for (let i = 0; i < 21; i++, d = addDays(d, -1)) if (isWorkingDay(ds, d)) return d;
  return addDays(before, -1);
}

/**
 * Latest working day whose output can be reported: today once most present people have logged,
 * otherwise the previous working day (people log at the end of their day).
 */
export function latestOutputDay(ds: Dataset): string {
  const t = ds.today;
  if (isWorkingDay(ds, t)) {
    const present = ds.employees.filter((e) => e.isActive && (ds.calendar.get(`${e.key}|${t}`)?.presence ?? 0) > 0).length;
    const logged = new Set(ds.submissions.filter((s) => s.date === t).map((s) => s.employeeKey)).size;
    if (present > 0 && logged >= present / 2) return t;
  }
  return previousWorkingDay(ds, t);
}

/** The previous comparable period. A single day compares with the previous working day. */
export function comparisonPeriod(ds: Dataset, f: { from: string; to: string }) {
  if (f.from === f.to) {
    const d = previousWorkingDay(ds, f.from);
    return { from: d, to: d };
  }
  return previousPeriod(f.from, f.to);
}
