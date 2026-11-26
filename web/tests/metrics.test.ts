import { describe, expect, it } from "vitest";
import { buildDataset, employeePerformance, headcount, outputSummary, processTargets, teamPerformance, teamTotals, deliverySummary, comparisonPeriod } from "@/lib/domain/metrics";
import { classifyCode } from "@/lib/sheets/parsers/calendarView";
import { presetRange, previousPeriod } from "@/lib/domain/dates";
import type { CalendarDay, Employee, LeaveRequest, OutputSubmission, TargetRow } from "@/lib/types";

const emp = (key: string, section = "Wind Team", isActive = true): Employee => ({ key, email: key, name: key.split("@")[0], role: "Engineer", section, isActive, employeeCode: null });
const day = (k: string, date: string, code: string): CalendarDay => ({ employeeKey: k, date, rawCode: code, ...classifyCode(code) });
const sub = (k: string, date: string, entries: Record<string, number>): OutputSubmission => ({ employeeKey: k, date, submittedAt: null, addedBy: k, entryStatus: "Updated", otherWork: null, leadNote: null, sourceRow: 1, entries });
const targets: TargetRow[] = [
  { key: "external|fqc", method: "External", process: "FQC", images: "", range: "10-12", perDay: 11, minutesPerWtg: 33 },
  { key: "external|analysis", method: "External", process: "Analysis", images: "", range: "7-8", perDay: 7.5, minutesPerWtg: 48 },
];

const A = "a@x.com", B = "b@x.com", C = "c@x.com";
// Mon 5 Jan – Wed 7 Jan 2026
const calendar = [
  day(A, "2026-01-05", ""), day(A, "2026-01-06", ""), day(A, "2026-01-07", "Second Half EL"),
  day(B, "2026-01-05", "WFH"), day(B, "2026-01-06", "CL"), day(B, "2026-01-07", "First Half WL"),
  day(C, "2026-01-05", "LoP"), day(C, "2026-01-06", "Week Off"), day(C, "2026-01-07", ""),
];
const leave: LeaveRequest[] = [
  { workflowId: "1", employeeKey: B, requestKind: "Time Off - Unplanned", leaveType: "CL", startDate: "2026-01-06", endDate: "2026-01-06", comment: "", appliedAt: null, closedAt: null, approvalStatus: "Approved", reviewedBy: "", leadComment: "", calendarStatus: "Processed", calendarComment: "", zohoApplied: "", managerNote: "", slackUrl: "", effective: true },
];
const submissions = [
  sub(A, "2026-01-05", { Ext_FQC: 11 }), // 1 target-day
  sub(A, "2026-01-06", { Ext_FQC: 5.5, Ext_Analysis: 3.75 }), // 0.5 + 0.5
  sub(A, "2026-01-07", { Ext_FQC: 11, "Critical Review": 20 }), // 1 target-day, CR untargeted
  sub(B, "2026-01-05", { Ext_Analysis: 7.5 }), // 1
  sub(C, "2026-01-06", { Ext_FQC: 11 }), // output on a week off: earns credit, adds no expected work
];
const ds = buildDataset({ today: "2026-01-08", employees: [emp(A), emp(B), emp(C, "GWO")], submissions, calendar, leave, delivery: [], targets, overtime: [], references: [], tasks: [] });
const F = { from: "2026-01-05", to: "2026-01-07" };

describe("attendance", () => {
  it("weights half days 0.5 (incl. WL); unplanned leave is leave, only LoP is absent", () => {
    const h = headcount(ds, "2026-01-06");
    // B has an approved unplanned CL: on leave (tagged unplanned), not absent (decision 25 Nov)
    expect(h).toMatchObject({ active: 3, present: 1, onLeave: 1, unplannedLeave: 1, absent: 0, weekOff: 1 });
    const h7 = headcount(ds, "2026-01-07");
    expect(h7).toMatchObject({ present: 0.5 + 0.5 + 1, halfDay: 2, onLeave: 2 });
    const h5 = headcount(ds, "2026-01-05");
    expect(h5).toMatchObject({ present: 2, wfh: 1, absent: 1 });
  });
  it("computes attendance % over scheduled days only", () => {
    const c = employeePerformance(ds, C, F).attendance;
    expect(c).toMatchObject({ scheduledDays: 2, presentDays: 1, lopDays: 1 });
    expect(c.attendancePct).toBe(50);
  });
});

describe("output & productivity", () => {
  it("keeps raw counts and target-days separately", () => {
    const o = outputSummary(ds, F);
    expect(o.totalSteps).toBe(11 + 5.5 + 3.75 + 11 + 20 + 7.5 + 11);
    expect(o.targetDays).toBeCloseTo(1 + 1 + 1 + 1 + 1, 10);
    expect(o.untargetedQty).toBe(20);
  });
  it("productivity = target-days / present days", () => {
    const a = employeePerformance(ds, A, F);
    expect(a.attendance.presentDays).toBe(2.5);
    expect(a.output.targetDays).toBeCloseTo(3);
    expect(a.productivityPct).toBeCloseTo(120);
    expect(a.coveragePct).toBeCloseTo((31.25 / 51.25) * 100); // 20 Critical Review is untargeted
    const c = employeePerformance(ds, C, F);
    expect(c.productivityPct).toBeCloseTo(100); // 1 target-day earned on week off / 1 present day
  });
  it("only ranks people meeting coverage and present-day rules", () => {
    expect(teamPerformance(ds, F).every((r) => r.rank === null)).toBe(true); // < 5 present days each
  });
  it("splits a person-day across processes for target vs actual", () => {
    const rows = Object.fromEntries(processTargets(ds, F).map((r) => [r.process, r]));
    // A 06/01: presence 1 split 50/50 -> FQC expected 5.5, Analysis expected 3.75
    // A 05/01: FQC expected 11; A 07/01: presence 0.5 -> FQC expected 5.5; C on week off adds 0 expected.
    expect(rows.Ext_FQC.expectedQty).toBeCloseTo(11 + 5.5 + 5.5);
    expect(rows.Ext_FQC.actualQty).toBe(11 + 5.5 + 11 + 11);
    expect(rows.Ext_Analysis.expectedQty).toBeCloseTo(3.75 + 7.5);
    expect(rows["Critical Review"]).toBeUndefined();
    const t = teamTotals(ds, F);
    expect(t.presentDays).toBe(2.5 + 1.5 + 1); // B: WFH 1 + CL 0 + half WL 0.5
    expect(t.productivityPct).toBeCloseTo(100); // 5 target-days / 5 present days
  });
});

describe("periods & deliveries", () => {
  it("builds presets and previous periods", () => {
    expect(presetRange("this_week", "2026-01-08")).toEqual({ from: "2026-01-05", to: "2026-01-08" });
    expect(presetRange("last_month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousPeriod("2026-01-05", "2026-01-11")).toEqual({ from: "2025-12-29", to: "2026-01-04" });
    expect(comparisonPeriod(ds, { from: "2026-01-07", to: "2026-01-07" })).toEqual({ from: "2026-01-06", to: "2026-01-06" });
  });
  it("uses the last working day's inventory, not weekend zeros", () => {
    const d = buildDataset({
      today: "2026-01-12", employees: [], submissions: [], calendar: [], leave: [], targets: [], overtime: [], references: [], tasks: [],
      delivery: [
        { stream: "External", date: "2026-01-09", delivered: 106, expected: 0, uploaded: 68, inventory: 216, qualityIssues: 106, duplicates: 0, lateUploads: 0, auditCount: 0 },
        { stream: "External", date: "2026-01-10", delivered: 0, expected: 0, uploaded: 0, inventory: 0, qualityIssues: 0, duplicates: 0, lateUploads: 0, auditCount: 0 },
      ],
    });
    const ext = deliverySummary(d, { from: "2026-01-05", to: "2026-01-11" })[0];
    expect(ext).toMatchObject({ delivered: 106, inventory: 216, qualityIssues: 106, asOf: "2026-01-09" });
  });
});

describe("targets kept in the app (decision 26 Nov)", () => {
  it("uses the upper end of each range and ignores the Target tab", async () => {
    const { upperEnd, DEFAULT_PROCESS_TARGETS } = await import("@/lib/targets");
    expect([upperEnd("10-12"), upperEnd("19"), upperEnd(" 2 - 3 "), upperEnd("2.5-3.5"), upperEnd(""), upperEnd("abc"), upperEnd("0")]).toEqual([12, 19, 3, 3.5, null, null, null]);
    const app = buildDataset({ today: "2026-01-08", employees: [emp(A)], submissions: [sub(A, "2026-01-05", { Ext_FQC: 12, "ZDT Pitch Beraring FQC": 15, "Critical Review": 4 })], calendar, leave: [], delivery: [], targets, overtime: [], references: [], tasks: [], appTargets: DEFAULT_PROCESS_TARGETS });
    const t = (c: string) => app.processes.get(c)!.target;
    expect(t("Ext_FQC")).toMatchObject({ perDay: 12, range: "10-12" }); // not the Target tab's 11
    expect(t("ZDT Pitch Beraring FQC").perDay).toBe(15); // own target, no longer ZDT FQC's
    expect(t("Skyspecs Data upload").perDay).toBe(130);
    expect(t("Full Internal Inspection(P+A+FQC)").perDay).toBe(3);
    expect(t("Critical Review").perDay).toBeNull(); // still excluded
    expect(employeePerformance(app, A, { from: "2026-01-05", to: "2026-01-05" }).output.targetDays).toBeCloseTo(2);
    // a process with its range cleared drops out of productivity
    const none = buildDataset({ today: "2026-01-08", employees: [], submissions: [], calendar: [], leave: [], delivery: [], targets, overtime: [], references: [], tasks: [], appTargets: { Ext_FQC: "" } });
    expect(none.processes.get("Ext_FQC")!.counts).toBe(false);
  });
});
