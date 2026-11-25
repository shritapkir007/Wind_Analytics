import { describe, expect, it } from "vitest";
import { applyWorkingRequests, fuzzyNameLookup, linkNamelessRows, nameMatchesEmail } from "@/lib/sync/identity";
import { classifyCode } from "@/lib/sheets/parsers/calendarView";
import { normEmail } from "@/lib/sheets/normalize";
import { buildDataset, employeePerformance, headcount } from "@/lib/domain/metrics";
import type { CalendarDay, LeaveRequest } from "@/lib/types";

describe("calendar codes added 25 Nov", () => {
  it("reads typos of half-day codes as the intended leave", () => {
    expect(classifyCode("Fisrt Half WL")).toMatchObject({ category: "half_leave", leaveType: "WL", presence: 0.5 });
    expect(classifyCode("Frist Half CL")).toMatchObject({ category: "half_leave", leaveType: "CL" });
    expect(classifyCode("Secound  Half EL")).toMatchObject({ category: "half_leave", leaveType: "EL" });
  });
  it("counts Bereavement and plain Leave as leave types of their own", () => {
    expect(classifyCode("Bereavement")).toMatchObject({ category: "leave", leaveType: "Bereavement", presence: 0 });
    expect(classifyCode("Leave")).toMatchObject({ category: "leave", leaveType: "Leave", presence: 0 });
  });
  it("treats training as present but separate", () => {
    expect(classifyCode("GWO Training")).toMatchObject({ category: "training", presence: 1 });
  });
});

describe("identity matching", () => {
  it("treats dronebase.com as zeitview.com", () => {
    expect(normEmail("harsha.mohankumar@dronebase.com")).toBe("harsha.mohankumar@zeitview.com");
  });

  it("matches names from the Resigned section to emails", () => {
    const cases: [string, string][] = [
      ["Pushparani NP", "pushparani.np@zeitview.com"],
      ["Kartik Bale", "kartik.bale@zeitview.com"],
      ["Aakanksha dongre", "aakanksha.d@zeitview.com"],
      ["Bindhu athipatla", "bindhu.a@zeitview.com"],
      ["Sarvesh Bobburi", "bobburi.sarvesh@zeitview.com"],
      ["Sowjanya Mutyala", "mohana.sowjanyamutyala@zeitview.com"],
      ["Abhishek ​Patil", "abhishek.patil@zeitview.com"],
      ["likith.​gowda", "likith.gowda@zeitview.com"],
      ["Sowmi M H", "sowmi.mh@zeitview.com"],
      ["Raghu H N", "raghu.hn@zeitview.com"],
      ["Sumit sil", "sumit.s@zeitview.com"],
      ["Jyotshna Rowlajanni", "jyotshna.rowlajanni@zeitview.com"],
    ];
    for (const [name, email] of cases) expect(nameMatchesEmail(name, email), `${name} ~ ${email}`).toBe(true);
    expect(nameMatchesEmail("Kartik Bale", "punith.sk@zeitview.com")).toBe(false);
    expect(nameMatchesEmail("Ravi", "ravi.kumar@zeitview.com")).toBe(false); // too short to be safe
  });

  it("links only unique matches", () => {
    const links = linkNamelessRows(
      [
        { key: "name:kartik-bale", name: "Kartik Bale" },
        { key: "name:old-member", name: "Old Member" },
      ],
      ["kartik.bale@zeitview.com", "someone.else@zeitview.com"],
    );
    expect(Object.fromEntries(links)).toEqual({ "name:kartik-bale": "kartik.bale@zeitview.com" });
    // two roster rows claiming the same email -> neither is linked
    const ambiguous = linkNamelessRows(
      [
        { key: "a", name: "Kartik Bale" },
        { key: "b", name: "Kartik  Bale" },
      ],
      ["kartik.bale@zeitview.com"],
    );
    expect(ambiguous.size).toBe(0);
  });

  it("matches 'Guruprasad B' to a unique first name + initial", () => {
    const people = [
      { key: "guru@x.com", name: "Guruprasad basavaraju" },
      { key: "gr@x.com", name: "GR Bhuvan" },
    ];
    expect(fuzzyNameLookup("Guruprasad B", people)).toBe("guru@x.com");
    expect(fuzzyNameLookup("Guruprasad K", people)).toBeNull();
  });
});

describe("approved Working requests", () => {
  const day = (k: string, date: string, code: string): CalendarDay => ({ employeeKey: k, date, rawCode: code, ...classifyCode(code) });
  const req = (over: Partial<LeaveRequest>): LeaveRequest => ({
    workflowId: "1", employeeKey: "a@x.com", requestKind: "Time Off - Planned", leaveType: "Working", startDate: "2026-03-21", endDate: "2026-03-22",
    comment: "", appliedAt: null, closedAt: null, approvalStatus: "Approved", reviewedBy: "", leadComment: "", calendarStatus: "Processed",
    calendarComment: "", zohoApplied: "", managerNote: "", slackUrl: "", effective: false, ...over,
  });

  it("turn the Week Off into a present working day", () => {
    const days = [day("a@x.com", "2026-03-21", "Week Off"), day("a@x.com", "2026-03-22", "Week Off"), day("b@x.com", "2026-03-21", "Week Off")];
    expect(applyWorkingRequests(days, [req({})])).toBe(2);
    expect(days.map((d) => [d.category, d.presence])).toEqual([["present", 1], ["present", 1], ["week_off", null]]);
  });

  it("ignore declined or reverted requests", () => {
    const days = [day("a@x.com", "2026-03-21", "Week Off")];
    expect(applyWorkingRequests(days, [req({ approvalStatus: "Declined" }), req({ calendarStatus: "Revert Leave" })])).toBe(0);
  });
});

describe("training days and productivity", () => {
  it("count for attendance but not in the productivity denominator", () => {
    const A = "a@x.com";
    const cal: CalendarDay[] = [
      { employeeKey: A, date: "2026-08-24", rawCode: "GWO Training", ...classifyCode("GWO Training") },
      { employeeKey: A, date: "2026-08-25", rawCode: "", ...classifyCode("") },
    ];
    const ds = buildDataset({
      today: "2026-08-26",
      employees: [{ key: A, email: A, name: "A", role: "", section: "T", isActive: true, employeeCode: null }],
      submissions: [{ employeeKey: A, date: "2026-08-25", submittedAt: null, addedBy: A, entryStatus: "Updated", otherWork: null, leadNote: null, sourceRow: 2, entries: { Ext_FQC: 11 } }],
      calendar: cal,
      leave: [],
      delivery: [],
      targets: [{ key: "external|fqc", method: "External", process: "FQC", images: "", range: "", perDay: 11, minutesPerWtg: null }],
      overtime: [],
      references: [],
      tasks: [],
    });
    const p = employeePerformance(ds, A, { from: "2026-08-24", to: "2026-08-25" });
    expect(p.attendance).toMatchObject({ presentDays: 2, workDays: 1, trainingDays: 1 });
    expect(p.productivityPct).toBe(100); // 1 target-day / 1 work day (training excluded)
    expect(p.noOutputDays).toBe(0); // no output expected on the training day
    expect(headcount(ds, "2026-08-24")).toMatchObject({ present: 1, training: 1, noOutputLogged: 0 });
  });
});
