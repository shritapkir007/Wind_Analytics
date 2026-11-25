import { describe, expect, it } from "vitest";
import { collect } from "@/lib/sync/collect";
import type { SheetSource } from "@/lib/sheets/source";
import type { Grid } from "@/lib/sheets/normalize";

// Minimal in-memory workbooks with the real tab layouts.
function source(book: Record<string, Record<string, Grid>>): SheetSource {
  return {
    name: "memory",
    listTabs: async (wb) => Object.keys(book[wb] ?? {}),
    getTabs: async (wb, tabs) => Object.fromEntries(tabs.map((t) => [t, book[wb]?.[t] ?? []])),
  };
}

const calendar: Grid = [
  ["Wind Team Leave Management - 2026", "", "", "November", "Nov 2", "Nov 3"],
  ["", "", "", "", "Monday", "Tuesday"],
  ["", "", "Headcount/Day ➡️", "", "2", "2"],
  ["Team Members", "Email", "Role"],
  ["Asha One", "asha.one@zeitview.com", "Engineer 1", "", "", ""],
  [],
  ["LM Blade Pilot "],
  ["Raghu H N", "", "Data Analyst", "", "", "GWO Training"],
  ["Puneeth JS", "", "Data Analyst"],
  [],
  ["Resigned/Layed OFF People "],
  ["Kartik Bale", "", "Data Analyst"],
];
const userInput: Grid = [
  ["Emplyoee Name", "Output_Date", "Data Added By", "Timestamp", "Which Backend Sheets Updated ?", "Output Entry Status", "Ext_FQC"],
  ["asha.one@zeitview.com", "02/11/2026", "", "02/11/2026 18:00:00", "", "Updated", "11"],
  ["raghu.hn@zeitview.com", "02/11/2026", "", "02/11/2026 18:00:00", "", "Updated", "5"],
  ["kartik.bale@zeitview.com", "02/11/2026", "", "02/11/2026 18:00:00", "", "Updated", "3"],
];

describe("collect: linking name-only Calendar View rows", () => {
  it("makes LM Blade Pilot members active once linked, keeps Resigned inactive", async () => {
    const snap = await collect(
      source({
        workstudy: { "User Input": userInput, "Active ZV": [], Target: [["Method", "Process", "", "", "Average WTG/Day"]], "Employee List": [] },
        leave: { "Calendar View": calendar, "Leave Tracker": [["Workflow ID"]], Tracker: [["Workflow ID"]], Dashboard: [] },
        overtime: { "Wind OT tracker 2026": [["Analyst Name", "Date"]], "Employee ID": [] },
      }),
      "quick",
    );
    const byKey = Object.fromEntries((snap.employees ?? []).map((e) => [e.key, e]));
    expect(byKey["raghu.hn@zeitview.com"]).toMatchObject({ name: "Raghu H N", section: "LM Blade Pilot", isActive: true });
    expect(byKey["kartik.bale@zeitview.com"]).toMatchObject({ name: "Kartik Bale", isActive: false });
    // Puneeth has no email and no records: stays a name-only, inactive roster row
    expect(byKey["name:puneeth-js"]).toMatchObject({ isActive: false });
    // his calendar days follow the new key, incl. the training code
    const raghuDays = (snap.calendar ?? []).filter((d) => d.employeeKey === "raghu.hn@zeitview.com");
    expect(raghuDays.map((d) => d.category)).toEqual(["present", "training"]);
    expect(snap.issues.filter((i) => i.code === "unmatched_person")).toEqual([]);
    expect(snap.issues.filter((i) => i.code === "linked_by_name").map((i) => i.rowRef).sort()).toEqual(["Kartik Bale", "Raghu H N"]);
  });
});
