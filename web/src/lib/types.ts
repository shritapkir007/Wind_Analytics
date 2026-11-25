export type Severity = "error" | "warning" | "info";

export interface Issue {
  source: string; // e.g. "workstudy"
  tab: string;
  rowRef: string; // "row 123" or a business key
  severity: Severity;
  code: string;
  message: string;
  raw?: unknown;
}

export interface Employee {
  key: string; // normalised email, or "name:<slug>" for roster rows without an email
  email: string | null;
  name: string;
  role: string;
  section: string;
  isActive: boolean;
  employeeCode: string | null;
}

export type DayCategory =
  | "present"
  | "wfh"
  | "half_leave"
  | "leave"
  | "lop"
  | "week_off"
  | "holiday"
  | "training"
  | "unknown";

export interface CalendarDay {
  employeeKey: string;
  date: string;
  rawCode: string;
  category: DayCategory;
  leaveType: string | null;
  /** 1 present, 0.5 half day, 0 leave/LoP, null when not a working day (week off / holiday). */
  presence: number | null;
}

export interface OutputSubmission {
  employeeKey: string;
  date: string;
  submittedAt: string | null;
  addedBy: string | null;
  entryStatus: string;
  otherWork: string | null;
  leadNote: string | null;
  sourceRow: number;
  entries: Record<string, number>; // process column -> qty (only > 0)
}

export interface LeaveRequest {
  workflowId: string;
  employeeKey: string;
  requestKind: string; // "Time Off - Planned" | "Time Off - Unplanned" | "Compensatory Off (CW-)" ...
  leaveType: string;
  startDate: string | null;
  endDate: string | null;
  comment: string;
  appliedAt: string | null;
  closedAt: string | null;
  approvalStatus: string;
  reviewedBy: string;
  leadComment: string;
  calendarStatus: string;
  calendarComment: string;
  zohoApplied: string;
  managerNote: string;
  slackUrl: string;
  /** Approved and not reverted in the calendar. */
  effective: boolean;
}

export type Stream = "External" | "Internal" | "ZDT";

export interface DeliveryDay {
  stream: Stream;
  date: string;
  delivered: number;
  expected: number;
  uploaded: number;
  inventory: number;
  qualityIssues: number;
  duplicates: number;
  lateUploads: number;
  auditCount: number;
}

export interface TargetRow {
  key: string; // "external|fqc"
  method: string;
  process: string;
  images: string;
  range: string; // "10-12"
  perDay: number | null; // Average WTG/Day
  minutesPerWtg: number | null;
}

export interface OvertimeEntry {
  rowKey: string;
  employeeKey: string | null;
  analystName: string;
  date: string;
  process: string;
  department: string;
  location: string;
  timeStart: string;
  timeEnd: string;
  shift: string;
  shiftWeight: number;
  turbinesText: string;
  turbinesParsed: number | null;
  supervisor: string;
}

export interface Reference {
  key: string; // e.g. "leaveDashboard.Total Leave Requests" or "calendar.headcount.2026-01-02"
  value: number;
}
