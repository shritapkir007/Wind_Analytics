import { describe, expect, it } from "vitest";
import {
  normEmail,
  parseDayFirst,
  parseDayFirstDateTime,
  parseSlackTimestamp,
  parseNumber,
  sumNumbersInText,
} from "@/lib/sheets/normalize";
import { classifyCode, parseCalendarView } from "@/lib/sheets/parsers/calendarView";
import { parseUserInput } from "@/lib/sheets/parsers/userInput";
import { parseLeaveDashboard, parseLeaveTracker } from "@/lib/sheets/parsers/leave";
import { parseActiveZv, parsePivot, parseTargets } from "@/lib/sheets/parsers/workstudyOther";
import { parseOvertime } from "@/lib/sheets/parsers/overtime";
import { PROCESSES, resolveTarget } from "@/lib/processes";

describe("normalise", () => {
  it("parses day-first dates (the previous builder read 02/01 as 1 Feb)", () => {
    expect(parseDayFirst("02/01/2026")).toBe("2026-01-02");
    expect(parseDayFirst("9/9/2026")).toBe("2026-09-09");
    expect(parseDayFirst("15/06/2026")).toBe("2026-06-15");
    expect(parseDayFirst("31/02/2026")).toBeNull();
    expect(parseDayFirst("Jan 5")).toBeNull();
    expect(parseDayFirstDateTime("10/11/2026 23:43:42")).toBe("2026-11-10T23:43:42+05:30");
  });
  it("parses Slack prose timestamps", () => {
    expect(parseSlackTimestamp("December 31st, 2025 at 11:39 AM GMT+5:30")).toBe("2025-12-31T11:39:00+05:30");
    expect(parseSlackTimestamp("January 2nd, 2026 at 12:11 AM GMT+5:30")).toBe("2026-01-02T00:11:00+05:30");
    expect(parseSlackTimestamp("November 17th, 2026 at 5:27 PM GMT+5:30")).toBe("2026-11-17T17:27:00+05:30");
  });
  it("normalises emails", () => {
    expect(normEmail(" Asha.One+old@Example.com ")).toBe("asha.one@example.com");
    expect(normEmail("ben.\u200Btwo@example.com")).toBe("ben.two@example.com");
    expect(normEmail("Asha")).toBeNull();
  });
  it("parses numbers and free text", () => {
    expect(parseNumber("1.33")).toEqual({ value: 1.33, ok: true });
    expect(parseNumber("")).toEqual({ value: 0, ok: true });
    expect(parseNumber("H").ok).toBe(false);
    expect(sumNumbersInText("13 external prescreen and 2 external analysis")).toBe(15);
    expect(sumNumbersInText("Full Day")).toBeNull();
  });
});

describe("Calendar View", () => {
  it("classifies codes per the sheet (half-day WL = 0.5 by decision)", () => {
    expect(classifyCode("")).toMatchObject({ category: "present", presence: 1 });
    expect(classifyCode("WFH")).toMatchObject({ category: "wfh", presence: 1 });
    expect(classifyCode("Working")).toMatchObject({ category: "present", presence: 1 });
    expect(classifyCode("Week Off")).toMatchObject({ category: "week_off", presence: null });
    expect(classifyCode("Public Holiday")).toMatchObject({ category: "holiday", presence: null });
    expect(classifyCode("EL CF")).toMatchObject({ category: "leave", leaveType: "EL CF", presence: 0 });
    expect(classifyCode("Comp Off")).toMatchObject({ category: "leave", leaveType: "Comp Off" });
    expect(classifyCode("Second Half EL")).toMatchObject({ category: "half_leave", presence: 0.5 });
    expect(classifyCode("First Half WL")).toMatchObject({ category: "half_leave", leaveType: "WL", presence: 0.5 });
    expect(classifyCode("LoP")).toMatchObject({ category: "lop", presence: 0 });
    expect(classifyCode("???")).toMatchObject({ category: "unknown" });
  });

  const grid = [
    ["Wind Team Leave Management - 2026", "", "", "January", "Jan 1", "Jan 2", "Jan 3", "February", "Feb 1"],
    ["", "", "", "", "Thursday", "Friday", "Saturday", "", "Sunday"],
    ["", "", "Headcount/Day ➡️", "", "0", "2", "1", "", "0"],
    ["Team Members", "Email", "Role"],
    ["Asha One", "asha.one@example.com", "Engineer 1", "", "Public Holiday", "", "Week Off", "", "Week Off"],
    ["Ben Two", "ben.two@example.com", "Engineer 2", "", "Public Holiday", "WL", ""],
    [],
    ["GWO "],
    ["Cara Three", "cara.three@example.com", "Data Analyst", "", "Public Holiday", "First Half CL", "Working"],
    ["Resigned/Layed OFF People "],
    ["Dev Four", "", "Data Analyst"],
    ["Eli Five", "eli.five@example.com", "Data Analyst"],
  ];

  it("reads roster, sections, dates and skips month-label columns", () => {
    const r = parseCalendarView(grid);
    expect(r.employees.map((e) => [e.key, e.section, e.isActive])).toEqual([
      ["asha.one@example.com", "Wind Team", true],
      ["ben.two@example.com", "Wind Team", true],
      ["cara.three@example.com", "GWO", true],
      ["name:dev-four", "Resigned/Layed OFF People", false],
      ["eli.five@example.com", "Resigned/Layed OFF People", false],
    ]);
    const dates = [...new Set(r.days.map((d) => d.date))];
    expect(dates).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-02-01"]);
    const ben = r.days.filter((d) => d.employeeKey === "ben.two@example.com");
    expect(ben.map((d) => d.presence)).toEqual([null, 0, 1, 1]);
    expect(r.references.find((x) => x.key === "calendar.headcount.2026-01-02")?.value).toBe(2);
    expect(r.issues.some((i) => i.code === "inactive_with_email")).toBe(true);
  });
});

describe("User Input", () => {
  const header = [
    "Emplyoee Name", "Output_Date", "Data Added By", "Timestamp", "Which Backend Sheets Updated ?",
    "Output Entry Status", "Ext_FQC", "Ext_Analysis", "ZDT Data Process ", "Other_Work", "Team Lead's Notes",
  ];
  const grid = [
    header,
    ["", "", "", "", "", "", "0", "0"],
    ["asha.one@example.com", "02/01/2026", "asha.one@example.com", "02/01/2026 18:06:37", "", "Updated", "7", "0", "", "0", "0"],
    ["ben.two@example.com", "9/1/2026", "ben.two@example.com", "11/01/2026 13:43:21", "", "Updated", "0", "1.33", "x", "1 QI resolved turbine", ""],
    ["asha.one@example.com", "02/01/2026", "asha.one@example.com", "02/01/2026 19:00:00", "", "Updated", "4"],
    ["bad", "02/01/2026"],
    ["cara.three@example.com", "32/01/2026"],
  ];
  it("keys by (email, Output_Date), keeps decimals and flags repeats", () => {
    const r = parseUserInput(grid);
    expect(r.submissions).toHaveLength(2);
    expect(r.submissions[0]).toMatchObject({ employeeKey: "asha.one@example.com", date: "2026-01-02", entries: { Ext_FQC: 7 } });
    expect(r.submissions[1]).toMatchObject({ date: "2026-01-09", entries: { Ext_Analysis: 1.33 }, otherWork: "1 QI resolved turbine" });
    expect(r.processColumns).toContain("ZDT Data Process");
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("duplicate_entry");
    expect(codes).toContain("bad_email");
    expect(codes).toContain("bad_date");
    expect(codes).toContain("non_numeric");
  });
});

describe("Leave", () => {
  const grid = [
    ["Leave's Log from the Slack", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Team Lead's Space"],
    ["Workflow ID", "Request from", "Request", "Request Type", "Start Date", "End Date", "Comment", "Follow up Comment", "Slack Message", "Application Time Stamp", "Approval Status", "Reviewed by", "Leads Comment", "Leads Follow up Comment", "Closures Time Stamp", "", "Status With \nCalendar View", "Comment from Calendar View", "Team Lead's Note", "Zoho Applied ?", " Manager's Note\n(LoP needs to manually add in Calendar View)"],
    ["1", "asha.one@example.com", "Time Off - Planned", "EL", "02/01/2026", "02/01/2026", "home", "", "https://x", "December 31st, 2025 at 11:39 AM GMT+5:30", "Approved", "@asha", "Approved", "", "December 31st, 2025 at 11:39 AM GMT+5:30", "", "Processed", "Leave Processed in Calendar View", "", "Yes"],
    ["2", "asha.one@example.com", "Time Off - Planned", "EL", "05/01/2026", "05/01/2026", "home", "", "", "", "Approved", "", "", "", "", "", "Processed", "Leave Reverted (Log now expired)"],
    ["3", "ben.two@example.com", "Time Off - Unplanned", "CL", "02/01/2026", "03/01/2026", "sick", "", "", "", "Declined", "", "select proper section", "", "", "", "Not Processed", "Leave is Declined"],
  ];
  it("treats reverted leaves as not effective", () => {
    const r = parseLeaveTracker(grid);
    expect(r.requests.map((x) => [x.workflowId, x.effective])).toEqual([["1", true], ["2", false], ["3", false]]);
    expect(r.requests[2]).toMatchObject({ startDate: "2026-01-02", endDate: "2026-01-03", requestKind: "Time Off - Unplanned" });
    expect(r.requests[0].appliedAt).toBe("2025-12-31T11:39:00+05:30");
    expect(r.requests[0].zohoApplied).toBe("Yes");
  });
  it("reads only the summary cards, not the repeated side-table headings", () => {
    // Mirrors the real Dashboard: cards in one row, then side tables with repeated headings.
    const d = parseLeaveDashboard([
      ["11/23/2026"], ["", "Employee Leave Requests Dashboard"], [], [], [], [], [], [],
      ["", "Total Leave \nRequests", "", "", "Approved Leave Requests", "", "", "In Discussion ", "", "", "Reconsider Request", "", "Leave Declined"],
      [],
      ["", "1975", "", "", "1897", "", "", "0", "", "", "4", "", "65"],
      [], [], [], [],
      ["", "Employee(s) on Leave Today", "", "", "", "", "", "", "", "", "", "Leave Requested", "", "", "Leave Approved"],
      ["Change Date", "23/11/2026", "", "", "", "", "", "", "", "", "", "Request From", "Total Leaves", "", "Request From", "Total Leaves"],
      ["", "", "", "", "", "", "", "", "", "", "", "Request from", "count Workflow ID", "", "Request from", "count Workflow ID"],
      ["", "", "", "", "", "", "", "", "", "", "", "a@example.com", "31", "", "b@example.com", "30"],
    ]);
    expect(d.map((x) => x.key)).toEqual([
      "leaveDashboard.Total Leave Requests",
      "leaveDashboard.Approved Leave Requests",
      "leaveDashboard.In Discussion",
      "leaveDashboard.Reconsider Request",
      "leaveDashboard.Leave Declined",
    ]);
    expect(new Set(d.map((x) => x.key)).size).toBe(d.length);
  });

  it("reads dashboard cards", () => {
    const d = parseLeaveDashboard([
      ["11/23/2026"], ["", "Employee Leave Requests Dashboard"], [], [], [], [], [], [],
      ["", "Total Leave \nRequests", "", "", "Approved Leave Requests", "", "", "", "", "", "", "", "Leave Declined"],
      [],
      ["", "1975", "", "", "1897", "", "", "", "", "", "", "", "65"],
    ]);
    expect(d).toEqual(
      expect.arrayContaining([
        { key: "leaveDashboard.Total Leave Requests", value: 1975 },
        { key: "leaveDashboard.Approved Leave Requests", value: 1897 },
        { key: "leaveDashboard.Leave Declined", value: 65 },
      ]),
    );
  });
});

describe("Work study others", () => {
  it("parses Active ZV streams", () => {
    const grid = [
      ["", "", "", "Blade External", "", "", "", "", "", "", "", "Blade Internal", "", "", "", "", "", "", "", "ZDT(Zero Down Time)"],
      [], [], [],
      ["Month", "Date", "No of Week", "Delivered/Day  ", "Expected/day", "Upload/Day ", "Current Inventory", "Quality Issue (In Asana)", "Duplicate Turbines", "Late Uploads", "External Audit Count ", "Delivered/Day  ", "Expected/day", "Upload/Day (inc.LM)", "Current Inventory", "Quality Issue (In Asana)", "Duplicate Turbines", "Late Uploads", "Internal Audot count ", "Delivered/Day  ", "Expected/day", "Upload/Day ", "Current Inventory", "Quality Issue (In Asana)", "Duplicate Turbines"],
      ["January", "02/01/2026", "1", "89", "0", "55", "259", "136", "0", "0", "", "1.33", "0", "20.33", "63", "61", "0", "0", "", "31", "0", "47", "59", "93", "0"],
    ];
    const r = parseActiveZv(grid);
    expect(r.issues).toEqual([]);
    expect(r.days).toEqual([
      expect.objectContaining({ stream: "External", date: "2026-01-02", delivered: 89, uploaded: 55, inventory: 259, qualityIssues: 136 }),
      expect.objectContaining({ stream: "Internal", delivered: 1.33, uploaded: 20.33, inventory: 63 }),
      expect.objectContaining({ stream: "ZDT", delivered: 31, inventory: 59, qualityIssues: 93 }),
    ]);
  });

  const targets = parseTargets([
    ["2026 - Throughput target"], [],
    ["Method", "Process", "Images", "WTG/Day", "Average WTG/Day", "Minutes/WTG"],
    ["External", "PreScreen", "300-500", "18-20", "19", "19"],
    ["External", "FQC", "300-500", "10-12", "11", "33"],
    ["ZDT", "Data Processing ", "", "8", "8", "45"],
    ["Internal - DP", "Data Processing", "", "6-8", "7", "51"],
  ]);

  it("reads targets live and maps processes to them (never invented)", () => {
    expect(targets.map((t) => [t.key, t.perDay])).toEqual([
      ["external|prescreen", 19], ["external|fqc", 11], ["zdt|data processing", 8], ["internal - dp|data processing", 7],
    ]);
    const get = (c: string) => resolveTarget(PROCESSES.find((p) => p.column === c)!, targets);
    expect(get("Ext_FQC")).toMatchObject({ perDay: 11, range: "10-12" });
    expect(get("ZDT Pitch Beraring Data Process").perDay).toBe(8);
    expect(get("Skyspecs Data upload")).toMatchObject({ perDay: null, source: "target missing in Target tab" });
    expect(get("Critical Review")).toMatchObject({ perDay: null, source: "no target (excluded)" });
    const withSky = [...targets, ...parseTargets([["Method", "Process", "", "", "Average WTG/Day"], ["Skyspecs", "Data upload", "", "", "40"]])];
    expect(resolveTarget(PROCESSES.find((p) => p.column === "Skyspecs Data upload")!, withSky).perDay).toBe(40);
  });

  it("parses pivot tabs for reconciliation", () => {
    const m = parsePivot([
      ["", "", "", "", "asha.one@example.com", "ben.two@example.com"],
      ["Month", "Date", "Day", "Total FQC", "Asha", "Ben"],
      ["", "", "", "11", "7", "4"],
      ["", "", "", "0.03", "0.02", "0.01"],
      ["January", "01/01/2026", "Thursday", "0", "H", "H"],
      ["January", "02/01/2026", "Friday", "11", "7", "4"],
    ]);
    expect(Object.fromEntries(m)).toEqual({ "asha.one@example.com|2026-01-02": 7, "ben.two@example.com|2026-01-02": 4 });
  });
});

describe("Overtime", () => {
  it("parses OT entries and matches names", () => {
    const grid = [
      ["Analyst Name", "Role", "Location", "Operational Process", "Supporting department", "Date", "Time Start", "Time ends", "Shift (0.5 &1)", "No. of Turbines delivered", "Column 14", "Supervisor name", "Notes", "Column 1", "Employee ID"],
      ["Asha One", "Engineer", "WfH", "Prescreen, Analysis", "Externals", "18/04/2026", "09:30:00", "06:30:00", "Full Day", "13 external prescreen and 2 external analysis"],
      ["Zed Unknown", "Engineer", "WfH", "FQC", "Externals", "19/04/2026", "09:30:00", "06:30:00", "Half Day", "10 FQC"],
    ];
    const r = parseOvertime(grid, (n) => (n === "Asha One" ? "asha.one@example.com" : null));
    expect(r.entries[0]).toMatchObject({ employeeKey: "asha.one@example.com", date: "2026-04-18", shiftWeight: 1, turbinesParsed: 15 });
    expect(r.entries[1]).toMatchObject({ employeeKey: null, shiftWeight: 0.5, turbinesParsed: 10 });
    expect(r.issues.map((i) => i.code)).toEqual(["unmatched_name"]);
  });
});
