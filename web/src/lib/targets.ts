// Productivity targets kept in the app (decision 26 Nov): one range per User Input process column,
// edited by admins in Settings. The upper end of the range is the per-day target (100%).
// These replace the "Target" tab of the Work Study sheet in both data modes.

/** Targets given on 26 Nov (WTG per day). Used until an admin saves their own. */
export const DEFAULT_PROCESS_TARGETS: Record<string, string> = {
  Ext_Prescreen: "19",
  Ext_Analysis: "7-8",
  Ext_FQC: "10-12",
  "Full Internal Inspection(P+A+FQC)": "2-3",
  Int_FQC: "2-3",
  "Int_Pre+Analysis": "2-3",
  "Data Process": "7-8",
  "ZDT Data Process": "10",
  "ZDT Pitch Beraring Data Process": "13-15",
  "ZDT Prescreen+Analysis": "10",
  "ZDT Pitch Beraring Prescreen+Analysis": "13-15",
  "ZDT FQC": "12",
  "ZDT Pitch Beraring FQC": "15",
  "Audit-2026": "10",
  "Skyspecs Data upload": "130",
};

export const RANGE_RE = /^\s*\d+(\.\d+)?\s*(-\s*\d+(\.\d+)?\s*)?$/;

/** "10-12" → 12, "19" → 19, "" or invalid → null. */
export function upperEnd(range: string): number | null {
  if (!RANGE_RE.test(range)) return null;
  const n = Math.max(...range.split("-").map((x) => Number(x.trim())));
  return n > 0 ? n : null;
}
