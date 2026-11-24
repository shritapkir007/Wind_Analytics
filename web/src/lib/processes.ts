// Catalogue of the numeric process columns in "User Input".
// Targets are never stored here: each process only names the row of the "Target" tab it uses
// (by Method + Process), and the value is read from the sheet on every sync.

import type { TargetRow } from "./types";

export type Family =
  | "Blade External"
  | "Blade Internal"
  | "ZDT"
  | "Data Process"
  | "Turbine Inspection"
  | "Uploads"
  | "Audit"
  | "Other";

export interface ProcessDef {
  column: string; // exact (trimmed) header in User Input
  label: string;
  family: Family;
  /** Target-tab lookup. "match" = substring search on "method process" when no exact row exists. */
  target?: { key?: string; match?: string };
  /** Counted in productivity (decision 23 Nov: targeted processes + Skyspecs). */
  inProductivity: boolean;
  /** Quality issue / rework resolution work. */
  rework?: boolean;
}

const P = (
  column: string,
  family: Family,
  opts: Partial<Omit<ProcessDef, "column" | "family">> = {},
): ProcessDef => ({
  column,
  family,
  label: opts.label ?? column.replace(/_/g, " "),
  target: opts.target,
  inProductivity: opts.inProductivity ?? Boolean(opts.target),
  rework: opts.rework,
});

export const PROCESSES: ProcessDef[] = [
  P("Ext_Prescreen", "Blade External", { target: { key: "external|prescreen" } }),
  P("Ext_Analysis", "Blade External", { target: { key: "external|analysis" } }),
  P("Ext_FQC", "Blade External", { target: { key: "external|fqc" } }),
  P("Ext_QI Resolved", "Blade External", { rework: true }),
  P("Critical Review", "Blade External"),
  P("SN Update Insights", "Blade External"),
  P("Ext_Eng Review", "Blade External"),
  P("Int_Eng Review", "Blade Internal"),
  P("Full Internal Inspection(P+A+FQC)", "Blade Internal", {
    label: "Full Internal Inspection (P+A+FQC)",
    // Only used if a matching row is added to the Target tab (none today).
    target: { match: "full internal" },
    inProductivity: true,
  }),
  P("Int_FQC", "Blade Internal", { target: { key: "internal|fqc" } }),
  P("Int_Pre+Analysis", "Blade Internal", { target: { key: "internal|prescreen + analysis" } }),
  P("Int_QI Resolved+Blade swap", "Blade Internal", { rework: true }),
  P("Pilot-Uploaders", "Uploads"),
  P("Data Process", "Data Process", { target: { key: "internal - dp|data processing" } }),
  P("Data Process_QI-Rework", "Data Process", { label: "Data Process QI-Rework", rework: true }),
  P("Nacelle", "Turbine Inspection"),
  P("Tower", "Turbine Inspection"),
  P("Cooler Top", "Turbine Inspection"),
  P("HUB Inspection", "Turbine Inspection"),
  P("ZDT Data Process", "ZDT", { target: { key: "zdt|data processing" } }),
  P("ZDT Pitch Beraring Data Process", "ZDT", {
    label: "ZDT Pitch Bearing Data Process",
    target: { key: "zdt|data processing" },
  }),
  P("ZDT Prescreen+Analysis", "ZDT", { target: { key: "zdt|prescreen + analysis" } }),
  P("ZDT Pitch Beraring Prescreen+Analysis", "ZDT", {
    label: "ZDT Pitch Bearing Prescreen+Analysis",
    target: { key: "zdt|prescreen + analysis" },
  }),
  P("ZDT FQC", "ZDT", { target: { key: "zdt|fqc" } }),
  P("ZDT Pitch Beraring FQC", "ZDT", { label: "ZDT Pitch Bearing FQC", target: { key: "zdt|fqc" } }),
  P("Nordex Calculation", "Other"),
  P("Audit-2026", "Audit", { label: "Audit", target: { key: "audit|audit work" } }),
  P("ZDT QI Resolved", "ZDT", { rework: true }),
  P("Skyspecs Data upload", "Uploads", {
    // Decision 23 Nov: included in productivity; target comes from the Target tab once added.
    target: { match: "skyspecs" },
    inProductivity: true,
  }),
];

/** Columns of User Input that are metadata or free text, not process quantities. */
export const USER_INPUT_META = [
  "Emplyoee Name",
  "Output_Date",
  "Data Added By",
  "Timestamp",
  "Which Backend Sheets Updated ?",
  "Output Entry Status",
  "Other_Work",
  "Team Lead's Notes",
];

const byColumn = new Map(PROCESSES.map((p) => [p.column.toLowerCase(), p]));

export function isKnownProcess(column: string): boolean {
  return byColumn.has(column.trim().toLowerCase());
}

export function processFor(column: string): ProcessDef {
  return (
    byColumn.get(column.trim().toLowerCase()) ?? {
      column: column.trim(),
      label: column.trim(),
      family: "Other",
      inProductivity: false,
    }
  );
}

export function targetKey(method: string, process: string): string {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return `${n(method)}|${n(process)}`;
}

export interface ResolvedTarget {
  perDay: number | null;
  range: string;
  targetKey: string | null;
  source: string; // human readable "Target tab · External · FQC" or "not in Target tab"
}

export function resolveTarget(p: ProcessDef, targets: TargetRow[]): ResolvedTarget {
  if (!p.target) return { perDay: null, range: "", targetKey: null, source: "no target (excluded)" };
  let row = p.target.key ? targets.find((t) => t.key === p.target!.key) : undefined;
  if (!row && p.target.match) {
    const m = p.target.match.toLowerCase();
    row = targets.find((t) => `${t.method} ${t.process}`.toLowerCase().includes(m));
  }
  if (!row || row.perDay == null || row.perDay <= 0)
    return { perDay: null, range: "", targetKey: null, source: "target missing in Target tab" };
  return {
    perDay: row.perDay,
    range: row.range,
    targetKey: row.key,
    source: `Target tab · ${row.method} · ${row.process}`,
  };
}

export const FAMILIES: Family[] = [
  "Blade External",
  "Blade Internal",
  "ZDT",
  "Data Process",
  "Turbine Inspection",
  "Uploads",
  "Audit",
  "Other",
];
