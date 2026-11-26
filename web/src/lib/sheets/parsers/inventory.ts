// "Wind-Inventory Count – 2026": one tab per Asana tracker (row 3 = Month, Date, Day, Week, then one
// column per section), plus the "Priority" tab of customer sites. Read-only.

import type { Issue } from "../../types";
import { TRACKERS } from "../../pipeline";
import { clean, hashOf, headerIndex, parseDayFirst, parseNumber, type Grid } from "../normalize";

const SRC = "inventory";

export interface PipelineRow {
  tracker: string;
  stage: string;
  date: string;
  count: number;
  updatedBy: string | null;
  updatedAt: string | null;
  hash: string;
}

/**
 * Daily counts per tracker and stage. A day whose stages are all blank/zero was not updated
 * (the sheet keeps a row for every day of the year), so it is skipped rather than read as an
 * empty pipeline. Days after `today` are ignored.
 */
export function parsePipeline(tabs: Record<string, Grid>, today: string): { rows: PipelineRow[]; issues: Issue[] } {
  const rows: PipelineRow[] = [];
  const issues: Issue[] = [];
  for (const t of TRACKERS) {
    const grid = tabs[t.tab];
    if (!grid) {
      issues.push({ source: SRC, tab: t.tab, rowRef: "tab", severity: "warning", code: "missing_tab", message: `Tab "${t.tab}" not found` });
      continue;
    }
    const hr = grid.findIndex((r, i) => i < 10 && headerIndex(r ?? [], "Date") >= 0 && headerIndex(r ?? [], "Month") >= 0);
    if (hr < 0) {
      issues.push({ source: SRC, tab: t.tab, rowRef: "header", severity: "error", code: "no_header", message: `${t.tab}: header row with Month and Date not found` });
      continue;
    }
    const header = grid[hr];
    const dateCol = headerIndex(header, "Date");
    const cols = t.stages.map((s) => ({ s, c: headerIndex(header, s.header) }));
    for (const { s, c } of cols)
      if (c < 0) issues.push({ source: SRC, tab: t.tab, rowRef: "header", severity: "warning", code: "missing_stage", message: `${t.tab}: column "${s.header}" not found` });
    for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const date = parseDayFirst(row[dateCol]);
      if (!date || date > today) continue;
      const vals = cols.filter((x) => x.c >= 0).map(({ s, c }) => ({ s, n: parseNumber(row[c]) }));
      for (const v of vals)
        if (!v.n.ok) issues.push({ source: SRC, tab: t.tab, rowRef: `row ${r + 1}`, severity: "warning", code: "not_a_number", message: `${t.tab} row ${r + 1}: "${clean(row[cols.find((x) => x.s === v.s)!.c])}" in ${v.s.header} is not a number` });
      if (vals.every((v) => v.n.value === 0)) continue;
      for (const { s, n } of vals) {
        const rec = { tracker: t.id, stage: s.id, date, count: n.value };
        rows.push({ ...rec, updatedBy: null, updatedAt: null, hash: hashOf(rec) });
      }
    }
  }
  return { rows, issues };
}

export interface PrioritySiteRow {
  id: string;
  site: string;
  wtgs: number | null;
  customer: string;
  prescreen: string;
  analysis: string;
  fqc: string;
  requestedBy: string;
  sla: string;
  status: string;
  comments: string;
  etd: string | null;
  sortOrder: number;
  updatedBy: string | null;
  updatedAt: string | null;
  hash: string;
}

export function parsePriority(grid: Grid): PrioritySiteRow[] {
  const hr = grid.findIndex((r, i) => i < 10 && headerIndex(r ?? [], "Priority Site") >= 0);
  if (hr < 0) throw new Error(`Priority: header row with "Priority Site" not found`);
  const h = grid[hr];
  const col = (...n: string[]) => headerIndex(h, ...n);
  const c = {
    site: col("Priority Site"),
    wtgs: col("Number of Wtgs Active"),
    customer: col("Customer"),
    prescreen: col("Prescreen"),
    analysis: col("Analysis"),
    fqc: col("FQC"),
    req: col("Request from - Ops Coordinator", "Request from"),
    sla: col("SLA"),
    status: col("Status"),
    comments: col("Comments"),
    etd: col("ETD"),
  };
  const get = (row: string[], i: number) => (i >= 0 ? clean(row[i]) : "");
  const out: PrioritySiteRow[] = [];
  for (let r = hr + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const site = get(row, c.site);
    if (!site) continue;
    const n = parseNumber(get(row, c.wtgs));
    const rec = {
      id: `sheet-${r + 1}`,
      site,
      wtgs: get(row, c.wtgs) && n.ok ? n.value : null,
      customer: get(row, c.customer),
      prescreen: get(row, c.prescreen).replace(/^-+$/, ""),
      analysis: get(row, c.analysis).replace(/^-+$/, ""),
      fqc: get(row, c.fqc).replace(/^-+$/, ""),
      requestedBy: get(row, c.req),
      sla: get(row, c.sla).replace(/^-+$/, ""),
      status: get(row, c.status),
      comments: get(row, c.comments),
      etd: parseDayFirst(get(row, c.etd)),
      sortOrder: r,
    };
    out.push({ ...rec, updatedBy: null, updatedAt: null, hash: hashOf(rec) });
  }
  return out;
}
