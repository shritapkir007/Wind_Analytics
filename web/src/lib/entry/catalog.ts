// Options for in-app data entry (safe to import in client components).

export const LEAVE_REQUEST_TYPES = [
  { value: "EL", label: "Earned leave (EL)", kind: "leave" },
  { value: "CL", label: "Casual leave (CL)", kind: "leave" },
  { value: "WL", label: "Wellness / sick leave (WL)", kind: "leave" },
  { value: "PL", label: "PL", kind: "leave" },
  { value: "EL CF", label: "Earned leave carried forward (EL CF)", kind: "leave" },
  { value: "Comp Off", label: "Comp off (for a day worked earlier)", kind: "leave" },
  { value: "Bereavement", label: "Bereavement leave", kind: "leave" },
  { value: "WFH", label: "Work from home", kind: "wfh" },
  { value: "Working", label: "Work on a day off (earns comp off)", kind: "working" },
] as const;

export type LeaveRequestType = (typeof LEAVE_REQUEST_TYPES)[number]["value"];

export function requestKindLabel(type: string, unplanned: boolean): string {
  if (type === "Working") return "Compensatory Work (CW+)";
  if (type === "WFH") return "Work from home";
  if (type === "Comp Off") return "Compensatory Off (CW-)";
  return unplanned ? "Time Off - Unplanned" : "Time Off - Planned";
}

/** Day codes a lead can set on the attendance calendar (same codes the calendar uses). */
export const OVERRIDE_CODES = [
  { value: "", label: "Present (office)" },
  { value: "WFH", label: "Work from home" },
  { value: "Working", label: "Working (on a day off)" },
  { value: "GWO Training", label: "Training" },
  { value: "LoP", label: "LoP (absent, unpaid)" },
  { value: "EL", label: "EL" },
  { value: "CL", label: "CL" },
  { value: "WL", label: "WL" },
  { value: "PL", label: "PL" },
  { value: "Comp Off", label: "Comp Off" },
  { value: "Bereavement", label: "Bereavement" },
  { value: "First Half EL", label: "First half EL" },
  { value: "Second Half EL", label: "Second half EL" },
  { value: "First Half CL", label: "First half CL" },
  { value: "Second Half CL", label: "Second half CL" },
  { value: "First Half WL", label: "First half WL" },
  { value: "Second Half WL", label: "Second half WL" },
  { value: "Week Off", label: "Week off" },
  { value: "Public Holiday", label: "Public holiday" },
] as const;

export const STREAMS = ["External", "Internal", "ZDT"] as const;
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
