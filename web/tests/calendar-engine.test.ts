import { describe, expect, it } from "vitest";
import { generateCalendar, leaveDaysRequested, type CalendarInputs, type RosterPerson } from "@/lib/domain/calendar-engine";

// Mon 2 Nov 2026 … Sun 8 Nov 2026; Tue 10 Nov is a holiday in the second week.
const asha: RosterPerson = { key: "asha@x.com", weekOff: [0, 6], workLocation: "office", joinedOn: null, leftOn: null };
const ravi: RosterPerson = { key: "ravi@x.com", weekOff: [0], workLocation: "wfh", joinedOn: "2026-11-04", leftOn: null };
const base = (over: Partial<CalendarInputs> = {}): CalendarInputs => ({
  holidays: new Map([["2026-11-10", "Diwali"]]),
  requests: [],
  overtimeDays: new Set(),
  overrides: new Map(),
  ...over,
});
const codes = (days: ReturnType<typeof generateCalendar>, key: string) => Object.fromEntries(days.filter((d) => d.employeeKey === key).map((d) => [d.date, d.rawCode]));

describe("in-app calendar", () => {
  it("generates office days, week offs, holidays and WFH defaults", () => {
    const days = generateCalendar([asha, ravi], "2026-11-02", "2026-11-10", base());
    expect(codes(days, "asha@x.com")).toEqual({
      "2026-11-02": "", "2026-11-03": "", "2026-11-04": "", "2026-11-05": "", "2026-11-06": "",
      "2026-11-07": "Week Off", "2026-11-08": "Week Off", "2026-11-09": "", "2026-11-10": "Public Holiday",
    });
    // Ravi joined on 4 Nov, works from home, only Sunday off
    expect(codes(days, "ravi@x.com")).toEqual({
      "2026-11-04": "WFH", "2026-11-05": "WFH", "2026-11-06": "WFH", "2026-11-07": "WFH", "2026-11-08": "Week Off", "2026-11-09": "WFH", "2026-11-10": "Public Holiday",
    });
  });

  it("applies approved leave (full and half day) but not on week offs", () => {
    const inp = base({
      requests: [
        { employeeKey: "asha@x.com", kind: "leave", leaveType: "EL", startDate: "2026-11-05", endDate: "2026-11-09", halfDay: null },
        { employeeKey: "asha@x.com", kind: "leave", leaveType: "CL", startDate: "2026-11-03", endDate: "2026-11-03", halfDay: "second" },
      ],
    });
    const c = codes(generateCalendar([asha], "2026-11-02", "2026-11-09", inp), "asha@x.com");
    expect(c["2026-11-03"]).toBe("Second Half CL");
    expect([c["2026-11-05"], c["2026-11-06"], c["2026-11-07"], c["2026-11-08"], c["2026-11-09"]]).toEqual(["EL", "EL", "Week Off", "Week Off", "EL"]);
  });

  it("turns a week off or holiday into a working day with approved OT / Working requests", () => {
    const inp = base({
      overtimeDays: new Set(["asha@x.com|2026-11-07", "asha@x.com|2026-11-10"]),
      requests: [{ employeeKey: "asha@x.com", kind: "working", leaveType: "", startDate: "2026-11-08", endDate: "2026-11-08", halfDay: null }],
    });
    const c = codes(generateCalendar([asha], "2026-11-07", "2026-11-10", inp), "asha@x.com");
    expect(c).toMatchObject({ "2026-11-07": "Working", "2026-11-08": "Working", "2026-11-10": "Working" });
  });

  it("lets a lead override any day (LoP, training)", () => {
    const inp = base({
      overrides: new Map([
        ["asha@x.com|2026-11-02", { employeeKey: "asha@x.com", date: "2026-11-02", code: "LoP" }],
        ["asha@x.com|2026-11-03", { employeeKey: "asha@x.com", date: "2026-11-03", code: "GWO Training" }],
      ]),
    });
    const days = generateCalendar([asha], "2026-11-02", "2026-11-03", inp);
    expect(days.map((d) => [d.rawCode, d.category, d.presence])).toEqual([["LoP", "lop", 0], ["GWO Training", "training", 1]]);
  });

  it("counts requested leave days without week offs and holidays", () => {
    const h = new Map([["2026-11-10", "Diwali"]]);
    expect(leaveDaysRequested(asha, "2026-11-06", "2026-11-10", null, h)).toBe(2); // Fri + Mon (Sat/Sun off, Tue holiday)
    expect(leaveDaysRequested(asha, "2026-11-03", "2026-11-03", "first", h)).toBe(0.5);
  });
});
