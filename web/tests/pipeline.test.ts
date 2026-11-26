import { describe, expect, it } from "vitest";
import { parsePipeline, parsePriority } from "@/lib/sheets/parsers/inventory";
import { TRACKERS } from "@/lib/pipeline";

const ext = [
  ["Asana - Wind Analytics Daily Tracker"],
  [],
  ["Month", "Date", "Day", "Week", "Prescreen", "ZV Analysis", "Accurance Analysis", "FQC", "Quality Issues", "Total", "Nordex analysis ", "Nordex FQC "],
  ["January", "01/01/2026", "Thu", "1", "0", "0", "0", "0", "0", "0"], // not updated: skipped
  ["January", "02/01/2026", "Fri", "1", "53", "32", "0", "34", "140", "259", "5", ""],
  ["November", "27/11/2026", "Fri", "4", "9", "9", "9", "9", "9", "45"], // future: skipped
];

describe("Wind-Inventory Count sheet", () => {
  it("reads one count per tracker, stage and day; skips empty and future days", () => {
    const { rows, issues } = parsePipeline({ [TRACKERS[0].tab]: ext }, "2026-11-26");
    expect(rows).toHaveLength(7);
    const get = (stage: string) => rows.find((r) => r.stage === stage)?.count;
    expect(rows.every((r) => r.tracker === "ext" && r.date === "2026-01-02")).toBe(true);
    expect([get("prescreen"), get("zv_analysis"), get("fqc"), get("quality_issues"), get("nordex_analysis"), get("nordex_fqc")]).toEqual([53, 32, 34, 140, 5, 0]);
    // the other six tabs are missing from this input
    expect(issues.filter((i) => i.code === "missing_tab")).toHaveLength(6);
  });

  it("reads priority sites with day-first ETD and keeps '-' as blank", () => {
    const rows = parsePriority([
      [], ["Date:"], ["2026-11-12"],
      ["Priority Site", "Number of Wtgs Active", "Customer", "Prescreen", "Analysis", "FQC", "Request from - Ops Coordinator", "SLA", "Status", "Comments", "ETD"],
      ["Foard City", "0", "GE", "-", "-", "-", "Camron", "--", "Complete", "DONE", "15-11-2026"],
      ["", "", "", ""],
      ["Crookwell 2", "24", "GE", "6", "10", "8", "Daniel AU", "48h", "In progress", "", ""],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "sheet-5", site: "Foard City", wtgs: 0, prescreen: "", sla: "", status: "Complete", etd: "2026-11-15" });
    expect(rows[1]).toMatchObject({ site: "Crookwell 2", wtgs: 24, analysis: "10", etd: null });
  });
});
