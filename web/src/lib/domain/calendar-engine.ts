// In-app attendance calendar (data mode "app"): one day per person per date, generated from the
// roster (week offs, work location, join/leave dates), public holidays, approved requests and
// lead overrides. It produces the same codes as the old Calendar View sheet, so every attendance
// rule (classifyCode) and KPI keeps working unchanged.

import type { CalendarDay } from "../types";
import { classifyCode } from "../sheets/parsers/calendarView";
import { eachDay, weekday } from "./dates";

export interface RosterPerson {
  key: string;
  weekOff: number[]; // 0 = Sunday … 6 = Saturday
  workLocation: string; // office | wfh
  joinedOn: string | null;
  leftOn: string | null;
}

export interface ApprovedRequest {
  employeeKey: string;
  kind: "leave" | "wfh" | "working";
  leaveType: string; // EL, CL, … (leave only)
  startDate: string;
  endDate: string;
  halfDay: "first" | "second" | null;
}

export interface Override {
  employeeKey: string;
  date: string;
  code: string;
}

export interface CalendarInputs {
  holidays: Map<string, string>; // date -> name
  requests: ApprovedRequest[];
  overtimeDays: Set<string>; // "key|date" with approved OT
  overrides: Map<string, Override>; // "key|date"
}

/** The Calendar View code for one person on one date, or null when they were not employed then. */
export function codeFor(p: RosterPerson, date: string, inp: CalendarInputs, reqIndex: Map<string, ApprovedRequest[]>): string | null {
  if (p.joinedOn && date < p.joinedOn) return null;
  if (p.leftOn && date > p.leftOn) return null;
  const k = `${p.key}|${date}`;
  const ov = inp.overrides.get(k);
  if (ov) return ov.code;
  if (inp.holidays.has(date)) return inp.overtimeDays.has(k) ? "Working" : "Public Holiday";
  const reqs = reqIndex.get(p.key)?.filter((r) => r.startDate <= date && date <= r.endDate) ?? [];
  const isOff = p.weekOff.includes(weekday(date));
  if (isOff) return inp.overtimeDays.has(k) || reqs.some((r) => r.kind === "working") ? "Working" : "Week Off";
  const leave = reqs.find((r) => r.kind === "leave");
  if (leave) return leave.halfDay ? `${leave.halfDay === "first" ? "First" : "Second"} Half ${leave.leaveType}` : leave.leaveType;
  if (reqs.some((r) => r.kind === "wfh") || p.workLocation === "wfh") return "WFH";
  return "";
}

export function generateCalendar(people: RosterPerson[], from: string, to: string, inp: CalendarInputs): CalendarDay[] {
  const reqIndex = new Map<string, ApprovedRequest[]>();
  for (const r of inp.requests) {
    const list = reqIndex.get(r.employeeKey) ?? [];
    list.push(r);
    reqIndex.set(r.employeeKey, list);
  }
  const out: CalendarDay[] = [];
  for (const p of people) {
    for (const date of eachDay(from, to)) {
      const code = codeFor(p, date, inp, reqIndex);
      if (code === null) continue;
      out.push({ employeeKey: p.key, date, rawCode: code, ...classifyCode(code) });
    }
  }
  return out;
}

/** Working days a leave request consumes (week offs and holidays are not counted; half day = 0.5). */
export function leaveDaysRequested(p: RosterPerson, startDate: string, endDate: string, halfDay: string | null, holidays: Map<string, string>): number {
  let n = 0;
  for (const d of eachDay(startDate, endDate)) {
    if (holidays.has(d) || p.weekOff.includes(weekday(d))) continue;
    n += halfDay ? 0.5 : 1;
  }
  return n;
}
