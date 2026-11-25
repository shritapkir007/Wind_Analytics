// Linking people across tabs when the sheets don't share an email.

import type { CalendarDay, LeaveRequest } from "../types";
import { clean } from "../sheets/normalize";
import { isReverted, isWorkingRequest } from "../sheets/parsers/leave";
import { eachDay } from "../domain/dates";

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const tokens = (s: string) =>
  clean(s)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/**
 * Does a display name belong to an email's local part? Used to link Calendar View rows that
 * have a name but no email (e.g. the "Resigned" section) to the emails in User Input / leave.
 *   "Pushparani NP" ~ pushparani.np · "Sarvesh Bobburi" ~ bobburi.sarvesh ·
 *   "Bindhu athipatla" ~ bindhu.a · "Sowjanya Mutyala" ~ mohana.sowjanyamutyala
 */
export function nameMatchesEmail(name: string, email: string): boolean {
  const local = email.split("@")[0];
  const a = letters(name);
  const b = letters(local);
  if (!a || !b) return false;
  if (a === b) return true;
  const sortedA = [...tokens(name)].sort().join("");
  const sortedB = [...tokens(local)].sort().join("");
  if (sortedA && sortedA === sortedB) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.includes(short);
}

/**
 * For each email without a roster row, find the single nameless roster row whose name matches
 * it (and that matches no other email). Returns rosterKey -> email.
 */
export function linkNamelessRows(nameless: { key: string; name: string }[], emails: string[]): Map<string, string> {
  const candidates = new Map<string, string[]>(); // rosterKey -> emails
  for (const r of nameless) candidates.set(r.key, emails.filter((e) => nameMatchesEmail(r.name, e)));
  const out = new Map<string, string>();
  for (const [key, list] of candidates) {
    if (list.length !== 1) continue;
    const email = list[0];
    const rivals = [...candidates.values()].filter((l) => l.includes(email)).length;
    if (rivals === 1) out.set(key, email);
  }
  return out;
}

/**
 * Loose name lookup for the OT tracker: "Guruprasad B" -> "Guruprasad basavaraju" when exactly
 * one person has that first name and a surname starting with that initial.
 */
export function fuzzyNameLookup(name: string, people: { key: string; name: string }[]): string | null {
  const [first, second] = tokens(name);
  if (!first || first.length < 3) return null;
  const hits = people.filter((p) => {
    const [f, s] = tokens(p.name);
    return f === first && (!second || (s ?? "").startsWith(second));
  });
  const unique = [...new Set(hits.map((h) => h.key))];
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Approved "Working" requests (working a day, e.g. a weekend, to earn comp off) make that day a
 * present working day even when Calendar View shows Week Off / Public Holiday (decision 25 Nov).
 * Returns how many calendar days were changed.
 */
export function applyWorkingRequests(days: CalendarDay[], leave: LeaveRequest[]): number {
  const byKey = new Map(days.map((d) => [`${d.employeeKey}|${d.date}`, d]));
  let changed = 0;
  for (const l of leave) {
    if (!isWorkingRequest(l.leaveType) || !/^approved$/i.test(l.approvalStatus) || isReverted(l.calendarStatus, l.calendarComment)) continue;
    if (!l.startDate || !l.endDate || l.endDate < l.startDate) continue;
    for (const date of eachDay(l.startDate, l.endDate)) {
      const d = byKey.get(`${l.employeeKey}|${date}`);
      if (!d || (d.category !== "week_off" && d.category !== "holiday")) continue;
      d.rawCode = `Working (approved request ${l.workflowId}; calendar: ${d.rawCode || d.category})`;
      d.category = "present";
      d.presence = 1;
      d.leaveType = null;
      changed++;
    }
  }
  return changed;
}
