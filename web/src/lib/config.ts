import "server-only";

/** Workbooks and the tabs read from each (decision D6: only four tabs of the leave workbook). */
export const WORKBOOKS = {
  workstudy: {
    label: "Work Study Wind WTGs/Day – 2026",
    env: "SHEET_WORKSTUDY_ID",
    tabs: ["User Input", "Active ZV", "Target", "Employee List"],
  },
  leave: {
    label: "Wind Leave Request Tracker – 2026",
    env: "SHEET_LEAVE_ID",
    tabs: ["Calendar View", "Leave Tracker", "Tracker", "Dashboard"],
  },
  overtime: {
    label: "Wind Team – OT tracker 2025-2026",
    env: "SHEET_OVERTIME_ID",
    tabs: ["Wind OT tracker 2026", "Employee ID"],
  },
  inventory: {
    label: "Wind-Inventory Count – 2026",
    env: "SHEET_INVENTORY_ID",
    tabs: [
      "Asana - Wind Analytics Daily Tracker",
      "Asana - External Quality Issues",
      "Asana - Internal Blade Analytics Daily Tracker",
      "Asana - Internal Data Process Tracker",
      "Asana - ZDT Analytics Daily Tracker",
      "ZDT Data Process",
      "ZV-Skyspecs- GE Upload Tracker",
      "Priority",
    ],
  },
} as const;

/** Workbooks with a known ID (used when the env variable is not set). */
const DEFAULT_IDS: Partial<Record<keyof typeof WORKBOOKS, string>> = {
  inventory: "1Xad0Er1b7qIX_hmR-nqfPJHfYdiBnyN5SuGLRjHnQ88",
};

export type WorkbookId = keyof typeof WORKBOOKS;

export function sheetId(wb: WorkbookId): string | null {
  return process.env[WORKBOOKS[wb].env]?.trim() || DEFAULT_IDS[wb] || null;
}

export function sheetUrl(wb: WorkbookId): string | null {
  const id = sheetId(wb);
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

export const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN ?? "zeitview.com").toLowerCase();

/** "Today" in IST, overridable for tests / fixture demos with APP_TODAY=YYYY-MM-DD. */
export function todayIST(): string {
  if (process.env.APP_TODAY) return process.env.APP_TODAY;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}
