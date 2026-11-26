// Wind inventory pipeline (decision 26 Nov): the stages of the "Wind-Inventory Count – 2026" sheet.
// Each tracker is one Asana board; every day someone records how many WTGs sit in each section.
// Safe to import in client components.

export interface Stage {
  id: string;
  label: string;
  /** Header in the tracker tab of the sheet (matched trimmed, case-insensitive). */
  header: string;
}

export interface Tracker {
  id: string;
  label: string;
  group: "External Blade" | "Internal Blade" | "Zero Down Time" | "Uploads";
  /** Tab of the Wind-Inventory Count sheet. */
  tab: string;
  /** What the total means on the dashboard. */
  unit: "WTGs" | "QIs" | "items";
  stages: Stage[];
}

const s = (id: string, label: string, header = label): Stage => ({ id, label, header });

export const TRACKERS: Tracker[] = [
  {
    id: "ext",
    label: "External Blade Analytics",
    group: "External Blade",
    tab: "Asana - Wind Analytics Daily Tracker",
    unit: "WTGs",
    stages: [
      s("prescreen", "Prescreen"),
      s("zv_analysis", "ZV Analysis"),
      s("accurance_analysis", "Accurance Analysis"),
      s("nordex_analysis", "Nordex Analysis", "Nordex analysis"),
      s("nordex_fqc", "Nordex FQC"),
      s("fqc", "FQC"),
      s("quality_issues", "Quality Issues"),
    ],
  },
  {
    id: "ext_qi",
    label: "External Quality Issues",
    group: "External Blade",
    tab: "Asana - External Quality Issues",
    unit: "QIs",
    stages: [
      s("eng_review", "Engineering – needs review", "Engineering - Needs review"),
      s("ops_action", "Ops – action needed", "Ops - Action needed"),
      s("ready_analysis", "Ready for analysis", "Ready for Analysis"),
      s("product_issue", "Product-related issues", "Product Related Issue"),
    ],
  },
  {
    id: "int",
    label: "Internal Blade Analytics",
    group: "Internal Blade",
    tab: "Asana - Internal Blade Analytics Daily Tracker",
    unit: "WTGs",
    stages: [s("prescreen_analysis", "Prescreen + Analysis", "Prescreen+Analysis"), s("fqc", "FQC"), s("quality_issues", "Quality Issues")],
  },
  {
    id: "int_dp",
    label: "Internal Data Process",
    group: "Internal Blade",
    tab: "Asana - Internal Data Process Tracker",
    unit: "WTGs",
    stages: [
      s("pending_upload", "Pending upload", "Pending Upload"),
      s("data_available", "Data available to download", "Data Avl to Download"),
      s("preprocessing", "In pre-processing", "In-Preprocessing"),
      s("pilot_uploader", "Pilot uploader", "Pilot Uploader"),
    ],
  },
  {
    id: "zdt",
    label: "Zero Down Time Analytics",
    group: "Zero Down Time",
    tab: "Asana - ZDT Analytics Daily Tracker",
    unit: "WTGs",
    stages: [s("prescreen_analysis", "Prescreen + Analysis", "Prescreen+Analysis"), s("fqc", "FQC"), s("quality_issues", "Quality Issues")],
  },
  {
    id: "zdt_dp",
    label: "ZDT Data Process",
    group: "Zero Down Time",
    tab: "ZDT Data Process",
    unit: "WTGs",
    stages: [s("preprocessing", "ZDT pre-processing", "ZDT Pre - Processing"), s("pilot_uploader", "ZDT pilot uploader", "ZDT Pilot uploader")],
  },
  {
    id: "skyspecs",
    label: "ZV–Skyspecs GE Upload",
    group: "Uploads",
    tab: "ZV-Skyspecs- GE Upload Tracker",
    unit: "items",
    stages: [s("yet_to_upload", "Yet to upload", "Yet to Upload Data"), s("in_progress", "In progress", "In Progress"), s("issue_error", "Issue / error", "Issue/Error")],
  },
];

export const TRACKER = new Map(TRACKERS.map((t) => [t.id, t]));

/** Priority-site statuses offered in the app (the sheet's own values are kept as they are). */
export const PRIORITY_STATUSES = ["Not started", "In progress", "On hold", "Complete"] as const;

export function isDone(status: string) {
  return /^(complete|completed|done|delivered)$/i.test(status.trim());
}
