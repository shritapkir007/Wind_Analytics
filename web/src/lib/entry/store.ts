import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema, type DB } from "../db";
import { nowIso, todayIST } from "../config";
import { addDays } from "../domain/dates";
import { generateCalendar, type ApprovedRequest, type RosterPerson } from "../domain/calendar-engine";
import { teamOf } from "../teams";
import type { CurrentUser } from "@/auth";

// ---------------------------------------------------------------------------------------------
// Data mode: "sheets" = mirror of the Google Sheets (sync); "app" = data entered in the app.

export type DataMode = "sheets" | "app";

export async function getDataMode(db?: DB): Promise<DataMode> {
  const d = db ?? (await getDb());
  const [row] = await d.select().from(schema.settings).where(eq(schema.settings.key, "dataMode"));
  return (row?.value as { mode?: DataMode } | undefined)?.mode === "app" ? "app" : "sheets";
}

export async function setDataMode(mode: DataMode, by: string, db?: DB) {
  const d = db ?? (await getDb());
  await d
    .insert(schema.settings)
    .values({ key: "dataMode", value: { mode, since: nowIso() }, updatedBy: by, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: { mode, since: nowIso() }, updatedBy: by, updatedAt: nowIso() } });
}

/** Incremented on every in-app write, so every server instance reloads the dashboards. */
export async function getDataVersion(db?: DB): Promise<number> {
  const d = db ?? (await getDb());
  const [row] = await d.select().from(schema.settings).where(eq(schema.settings.key, "dataVersion"));
  return Number((row?.value as { v?: number } | undefined)?.v ?? 0);
}

export async function bumpDataVersion(db?: DB) {
  const d = db ?? (await getDb());
  const v = (await getDataVersion(d)) + 1;
  await d
    .insert(schema.settings)
    .values({ key: "dataVersion", value: { v }, updatedBy: "system", updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: { v }, updatedAt: nowIso() } });
}

export async function audit(actor: string, entity: string, entityId: string, action: string, detail?: unknown, db?: DB) {
  const d = db ?? (await getDb());
  await d.insert(schema.auditEvents).values({ at: nowIso(), actor, entity, entityId, action, detail: (detail ?? null) as never });
}

// ---------------------------------------------------------------------------------------------
// Who may do what

export type Me = { user: CurrentUser; employee: typeof schema.employees.$inferSelect | null };

export async function whoAmI(user: CurrentUser): Promise<Me> {
  const db = await getDb();
  const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.email, user.email.toLowerCase()));
  return { user, employee: employee ?? null };
}

const RANK = { viewer: 0, lead: 1, manager: 2, admin: 3 } as const;

/** Leads act for people in their own team; managers and admins for everyone. */
export function canActFor(me: Me, target: { key: string; section: string } | null | undefined): boolean {
  if (!target) return false;
  if (RANK[me.user.role] >= RANK.manager) return true;
  if (me.employee?.key === target.key) return true;
  if (me.user.role === "lead" && me.employee) return teamOf(me.employee.section).team === teamOf(target.section).team;
  return false;
}

/** Approving needs lead rights over the person, and nobody approves their own request (except admins). */
export function canApproveFor(me: Me, target: { key: string; section: string } | null | undefined): boolean {
  if (!target) return false;
  if (me.user.role === "admin") return true;
  if (me.employee?.key === target.key) return false;
  if (me.user.role === "manager") return true;
  return me.user.role === "lead" && Boolean(me.employee) && teamOf(me.employee!.section).team === teamOf(target.section).team;
}

// ---------------------------------------------------------------------------------------------
// Calendar materialisation (data mode "app")

/** Days kept in calendar_days: from 1 Jan of the current year to 120 days ahead. */
export function calendarWindow(today = todayIST()) {
  return { from: `${today.slice(0, 4)}-01-01`, to: addDays(today, 120) };
}

/**
 * Regenerate calendar_days for some people (or everyone) over a date range from the roster,
 * holidays, approved requests, approved OT and overrides.
 */
export async function rebuildCalendar(opts: { keys?: string[]; from?: string; to?: string } = {}, db?: DB) {
  const d = db ?? (await getDb());
  const win = calendarWindow();
  const from = opts.from && opts.from > win.from ? opts.from : win.from;
  const to = opts.to && opts.to < win.to ? opts.to : win.to;
  if (from > to) return 0;
  const keys = opts.keys;
  const [emps, hol, leaves, ot, ovs] = await Promise.all([
    keys ? d.select().from(schema.employees).where(inArray(schema.employees.key, keys)) : d.select().from(schema.employees),
    d.select().from(schema.holidays),
    keys
      ? d.select().from(schema.leaveRequests).where(and(eq(schema.leaveRequests.approvalStatus, "Approved"), inArray(schema.leaveRequests.employeeKey, keys)))
      : d.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.approvalStatus, "Approved")),
    d.select({ employeeKey: schema.overtimeEntries.employeeKey, date: schema.overtimeEntries.date }).from(schema.overtimeEntries).where(eq(schema.overtimeEntries.status, "Approved")),
    d.select().from(schema.attendanceOverrides).where(and(gte(schema.attendanceOverrides.date, from), lte(schema.attendanceOverrides.date, to))),
  ]);
  const people: RosterPerson[] = emps
    .filter((e) => e.isActive || e.leftOn)
    .map((e) => ({ key: e.key, weekOff: e.weekOff ?? [0, 6], workLocation: e.workLocation, joinedOn: e.joinedOn, leftOn: e.leftOn ?? (e.isActive ? null : e.leftOn) }));
  const requests: ApprovedRequest[] = leaves
    .filter((l) => l.startDate && l.endDate)
    .map((l) => ({
      employeeKey: l.employeeKey,
      kind: /^working$/i.test(l.leaveType) ? "working" : /^wfh$/i.test(l.leaveType) ? "wfh" : "leave",
      leaveType: l.leaveType,
      startDate: l.startDate!,
      endDate: l.endDate!,
      halfDay: (l.halfDay as "first" | "second" | null) ?? null,
    }));
  const days = generateCalendar(people, from, to, {
    holidays: new Map(hol.map((h) => [h.date, h.name])),
    requests,
    overtimeDays: new Set(ot.filter((o) => o.employeeKey).map((o) => `${o.employeeKey}|${o.date}`)),
    overrides: new Map(ovs.map((o) => [`${o.employeeKey}|${o.date}`, o])),
  });
  await d.transaction(async (tx) => {
    const range = and(gte(schema.calendarDays.date, from), lte(schema.calendarDays.date, to));
    await tx.delete(schema.calendarDays).where(keys ? and(range, inArray(schema.calendarDays.employeeKey, keys)) : range);
    for (let i = 0; i < days.length; i += 3000)
      await tx.insert(schema.calendarDays).values(days.slice(i, i + 3000).map((x) => ({ ...x, hash: "" })));
  });
  return days.length;
}
