"use server";

// Server actions for in-app data entry (data mode "app"). Every action checks permissions,
// validates input, writes an audit event and bumps the data version so dashboards refresh.

import { revalidatePath } from "next/cache";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { currentUser, requireRole } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { ALLOWED_DOMAIN, nowIso, todayIST } from "@/lib/config";
import { addDays } from "@/lib/domain/dates";
import { PROCESSES, targetKey } from "@/lib/processes";
import { normEmail } from "@/lib/sheets/normalize";
import { LEAVE_REQUEST_TYPES, OVERRIDE_CODES, STREAMS, requestKindLabel } from "@/lib/entry/catalog";
import { audit, bumpDataVersion, canActFor, canApproveFor, getDataMode, rebuildCalendar, setDataMode, whoAmI } from "@/lib/entry/store";
import { leaveDaysRequested } from "@/lib/domain/calendar-engine";
import { refreshAlerts } from "@/lib/domain/alerts";
import { getSettings } from "@/lib/domain/settings";

export interface Result {
  ok: boolean;
  error?: string;
  message?: string;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : (e as Error).message });

async function done(paths: string[] = []) {
  await bumpDataVersion();
  try {
    await refreshAlerts();
  } catch (e) {
    console.error("alert refresh failed", e);
  }
  revalidatePath("/", "layout");
  for (const p of paths) revalidatePath(p);
}

async function requireAppMode() {
  if ((await getDataMode()) !== "app") throw new Error("In-app data entry is not switched on yet. An admin can switch it on in Settings → Data entry.");
}

async function employee(key: string) {
  const db = await getDb();
  const [e] = await db.select().from(schema.employees).where(eq(schema.employees.key, key));
  return e ?? null;
}

// ------------------------------------------------------------------ daily output (+ extra work)

const OutputInput = z.object({
  employeeKey: z.string().min(3),
  date: isoDate,
  entries: z.record(z.string(), z.coerce.number().min(0, "Quantities cannot be negative").max(1000, "A quantity looks too large")),
  otherWork: z.string().trim().max(2000).default(""),
});

export async function saveOutput(input: z.input<typeof OutputInput>): Promise<Result> {
  try {
    await requireAppMode();
    const me = await whoAmI(await currentUser());
    const v = OutputInput.parse(input);
    const target = await employee(v.employeeKey);
    if (!canActFor(me, target)) throw new Error("You can only log output for yourself (leads: for your team).");
    const today = todayIST();
    if (v.date > today) throw new Error("Output can't be logged for a future date.");
    const own = me.employee?.key === v.employeeKey;
    const { entry } = await getSettings();
    if (own && me.user.role === "viewer" && v.date < addDays(today, -entry.selfEditDays))
      throw new Error(`You can edit your own output for the last ${entry.selfEditDays} days. Ask your lead to change older days.`);
    const known = new Set(PROCESSES.map((p) => p.column));
    const entries: Record<string, number> = {};
    for (const [k, n] of Object.entries(v.entries)) {
      if (!known.has(k)) throw new Error(`Unknown process "${k}"`);
      if (n > 0) entries[k] = Math.round(n * 100) / 100;
    }
    const db = await getDb();
    const now = nowIso();
    if (!Object.keys(entries).length && !v.otherWork) {
      await db.delete(schema.outputSubmissions).where(and(eq(schema.outputSubmissions.employeeKey, v.employeeKey), eq(schema.outputSubmissions.date, v.date)));
      await audit(me.user.email, "output", `${v.employeeKey}|${v.date}`, "cleared");
    } else {
      const [existing] = await db
        .select({ submittedAt: schema.outputSubmissions.submittedAt })
        .from(schema.outputSubmissions)
        .where(and(eq(schema.outputSubmissions.employeeKey, v.employeeKey), eq(schema.outputSubmissions.date, v.date)));
      const row = {
        employeeKey: v.employeeKey,
        date: v.date,
        submittedAt: existing?.submittedAt ?? now,
        addedBy: me.user.email,
        entryStatus: existing ? "Edited" : own ? "Submitted" : "Entered by lead",
        otherWork: v.otherWork || null,
        leadNote: null,
        sourceRow: 0,
        entries,
        updatedAt: now,
        updatedBy: me.user.email,
        hash: "",
      };
      await db
        .insert(schema.outputSubmissions)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.outputSubmissions.employeeKey, schema.outputSubmissions.date],
          set: { entries, otherWork: row.otherWork, entryStatus: row.entryStatus, updatedAt: now, updatedBy: me.user.email, addedBy: me.user.email },
        });
      await audit(me.user.email, "output", `${v.employeeKey}|${v.date}`, existing ? "updated" : "created", { entries, otherWork: v.otherWork });
    }
    await done(["/me", "/output"]);
    return { ok: true, message: "Output saved" };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ leave / WFH / working requests

const LeaveInput = z.object({
  employeeKey: z.string().min(3),
  type: z.enum(LEAVE_REQUEST_TYPES.map((t) => t.value) as [string, ...string[]]),
  startDate: isoDate,
  endDate: isoDate,
  halfDay: z.enum(["", "first", "second"]).default(""),
  unplanned: z.coerce.boolean().default(false),
  reason: z.string().trim().min(2, "Add a short reason").max(1000),
});

export async function requestLeave(input: z.input<typeof LeaveInput>): Promise<Result> {
  try {
    await requireAppMode();
    const me = await whoAmI(await currentUser());
    const v = LeaveInput.parse(input);
    const target = await employee(v.employeeKey);
    if (!canActFor(me, target)) throw new Error("You can only request leave for yourself (leads: for your team).");
    if (v.endDate < v.startDate) throw new Error("The end date is before the start date.");
    if (v.halfDay && v.startDate !== v.endDate) throw new Error("A half day must start and end on the same date.");
    if (v.halfDay && LEAVE_REQUEST_TYPES.find((t) => t.value === v.type)?.kind !== "leave") throw new Error("Half days apply to leave types only.");
    if (addDays(v.startDate, 62) < v.endDate) throw new Error("A single request can cover at most 2 months.");
    const db = await getDb();
    const overlap = await db
      .select({ id: schema.leaveRequests.workflowId })
      .from(schema.leaveRequests)
      .where(
        and(
          eq(schema.leaveRequests.employeeKey, v.employeeKey),
          or(eq(schema.leaveRequests.approvalStatus, "Pending"), eq(schema.leaveRequests.approvalStatus, "Approved")),
          sql`${schema.leaveRequests.startDate} <= ${v.endDate} and ${schema.leaveRequests.endDate} >= ${v.startDate}`,
        ),
      );
    if (overlap.length) throw new Error(`These dates overlap an existing request (${overlap.map((o) => o.id).join(", ")}).`);
    const hol = await db.select().from(schema.holidays);
    const kind = LEAVE_REQUEST_TYPES.find((t) => t.value === v.type)!.kind;
    if (kind === "leave" && target && leaveDaysRequested({ key: target.key, weekOff: target.weekOff ?? [0, 6], workLocation: target.workLocation, joinedOn: target.joinedOn, leftOn: target.leftOn }, v.startDate, v.endDate, v.halfDay || null, new Map(hol.map((h) => [h.date, h.name]))) === 0)
      throw new Error("These dates are all week offs or holidays, so no leave is needed.");
    const id = `LR-${Date.now().toString(36).toUpperCase()}`;
    const now = nowIso();
    await db.insert(schema.leaveRequests).values({
      workflowId: id,
      employeeKey: v.employeeKey,
      requestKind: requestKindLabel(v.type, v.unplanned),
      leaveType: v.type,
      startDate: v.startDate,
      endDate: v.endDate,
      comment: v.reason,
      appliedAt: now,
      approvalStatus: "Pending",
      effective: false,
      halfDay: v.halfDay || null,
      createdBy: me.user.email,
      hash: "",
    });
    await audit(me.user.email, "leave", id, "requested", v);
    await done(["/me", "/approvals", "/attendance"]);
    return { ok: true, message: `Request ${id} sent for approval` };
  } catch (e) {
    return fail(e);
  }
}

export async function decideLeave(workflowId: string, decision: "Approved" | "Declined", comment = ""): Promise<Result> {
  try {
    await requireAppMode();
    const me = await whoAmI(await currentUser());
    const db = await getDb();
    const [req] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.workflowId, workflowId));
    if (!req) throw new Error("Request not found");
    if (req.approvalStatus !== "Pending") throw new Error(`This request is already ${req.approvalStatus.toLowerCase()}.`);
    if (!canApproveFor(me, await employee(req.employeeKey))) throw new Error("You can't approve this request (your own requests, or people outside your team).");
    const isLeave = LEAVE_REQUEST_TYPES.find((t) => t.value === req.leaveType)?.kind === "leave";
    await db
      .update(schema.leaveRequests)
      .set({
        approvalStatus: decision,
        reviewedBy: me.user.email,
        leadComment: comment.slice(0, 1000),
        closedAt: nowIso(),
        calendarStatus: decision === "Approved" ? "Processed" : "Not Processed",
        effective: decision === "Approved" && isLeave,
      })
      .where(eq(schema.leaveRequests.workflowId, workflowId));
    if (decision === "Approved") await rebuildCalendar({ keys: [req.employeeKey], from: req.startDate ?? undefined, to: req.endDate ?? undefined });
    await audit(me.user.email, "leave", workflowId, decision.toLowerCase(), { comment });
    await done(["/approvals", "/me", "/attendance"]);
    return { ok: true, message: `${workflowId} ${decision.toLowerCase()}` };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelLeave(workflowId: string): Promise<Result> {
  try {
    await requireAppMode();
    const me = await whoAmI(await currentUser());
    const db = await getDb();
    const [req] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.workflowId, workflowId));
    if (!req) throw new Error("Request not found");
    const mine = me.employee?.key === req.employeeKey;
    if (!mine && !canApproveFor(me, await employee(req.employeeKey))) throw new Error("You can't cancel this request.");
    if (req.approvalStatus === "Approved" && mine && me.user.role === "viewer" && (req.startDate ?? "") <= todayIST())
      throw new Error("Leave that has already started can only be cancelled by your lead.");
    if (!["Pending", "Approved"].includes(req.approvalStatus)) throw new Error(`This request is already ${req.approvalStatus.toLowerCase()}.`);
    await db.update(schema.leaveRequests).set({ approvalStatus: "Cancelled", effective: false, closedAt: nowIso(), calendarStatus: "Cancelled" }).where(eq(schema.leaveRequests.workflowId, workflowId));
    if (req.approvalStatus === "Approved") await rebuildCalendar({ keys: [req.employeeKey], from: req.startDate ?? undefined, to: req.endDate ?? undefined });
    await audit(me.user.email, "leave", workflowId, "cancelled");
    await done(["/me", "/approvals", "/attendance"]);
    return { ok: true, message: `${workflowId} cancelled` };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ overtime

const OtInput = z.object({
  employeeKey: z.string().min(3),
  date: isoDate,
  process: z.string().trim().min(1, "Choose the work done").max(120),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, "Start time HH:MM"),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, "End time HH:MM"),
  shift: z.enum(["Full Day", "Half Day"]),
  turbines: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export async function logOvertime(input: z.input<typeof OtInput>): Promise<Result> {
  try {
    await requireAppMode();
    const me = await whoAmI(await currentUser());
    const v = OtInput.parse(input);
    const target = await employee(v.employeeKey);
    if (!canActFor(me, target)) throw new Error("You can only log OT for yourself (leads: for your team).");
    if (v.date > todayIST()) throw new Error("OT can't be logged for a future date.");
    const db = await getDb();
    const id = `OT-${Date.now().toString(36).toUpperCase()}`;
    const nums = v.turbines.match(/\d+(?:\.\d+)?/g);
    await db.insert(schema.overtimeEntries).values({
      rowKey: id,
      employeeKey: v.employeeKey,
      analystName: target?.name ?? v.employeeKey,
      date: v.date,
      process: v.process,
      department: target?.section ?? "",
      location: target?.workLocation === "wfh" ? "WfH" : "WfO",
      timeStart: v.timeStart,
      timeEnd: v.timeEnd,
      shift: v.shift,
      shiftWeight: v.shift === "Half Day" ? 0.5 : 1,
      turbinesText: [v.turbines, v.notes].filter(Boolean).join(" · "),
      turbinesParsed: nums ? nums.reduce((a, n) => a + Number(n), 0) : null,
      supervisor: "",
      status: "Pending",
      createdBy: me.user.email,
      hash: "",
    });
    await audit(me.user.email, "overtime", id, "requested", v);
    await done(["/me", "/approvals"]);
    return { ok: true, message: `OT ${id} sent for approval` };
  } catch (e) {
    return fail(e);
  }
}

export async function decideOvertime(rowKey: string, decision: "Approved" | "Declined", comment = ""): Promise<Result> {
  try {
    await requireAppMode();
    const me = await whoAmI(await currentUser());
    const db = await getDb();
    const [ot] = await db.select().from(schema.overtimeEntries).where(eq(schema.overtimeEntries.rowKey, rowKey));
    if (!ot) throw new Error("OT entry not found");
    if (ot.status !== "Pending") throw new Error(`This OT entry is already ${ot.status.toLowerCase()}.`);
    if (!ot.employeeKey || !canApproveFor(me, await employee(ot.employeeKey))) throw new Error("You can't approve this OT entry.");
    await db
      .update(schema.overtimeEntries)
      .set({ status: decision, reviewedBy: me.user.email, reviewedAt: nowIso(), reviewComment: comment.slice(0, 1000), supervisor: me.employee?.name ?? me.user.name })
      .where(eq(schema.overtimeEntries.rowKey, rowKey));
    if (decision === "Approved") await rebuildCalendar({ keys: [ot.employeeKey], from: ot.date, to: ot.date });
    await audit(me.user.email, "overtime", rowKey, decision.toLowerCase(), { comment });
    await done(["/approvals", "/me"]);
    return { ok: true, message: `${rowKey} ${decision.toLowerCase()}` };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ inventory (Active ZV replacement)

const num = z.coerce.number().min(0).max(100000);
const InventoryInput = z.object({
  date: isoDate,
  rows: z.array(
    z.object({
      stream: z.enum(STREAMS),
      expected: num.default(0),
      uploaded: num.default(0),
      inventory: num.default(0),
      qualityIssues: num.default(0),
      duplicates: num.default(0),
      lateUploads: num.default(0),
      auditCount: num.default(0),
      delivered: z.union([num, z.literal("")]).optional(),
    }),
  ),
});

export async function saveInventory(input: z.input<typeof InventoryInput>): Promise<Result> {
  try {
    await requireAppMode();
    const user = await requireRole("lead");
    const v = InventoryInput.parse(input);
    if (v.date > todayIST()) throw new Error("Inventory can't be recorded for a future date.");
    const db = await getDb();
    const now = nowIso();
    for (const r of v.rows) {
      const manual = r.delivered !== undefined && r.delivered !== "";
      const row = {
        stream: r.stream,
        date: v.date,
        delivered: manual ? Number(r.delivered) : 0,
        deliveredManual: manual,
        expected: r.expected,
        uploaded: r.uploaded,
        inventory: r.inventory,
        qualityIssues: r.qualityIssues,
        duplicates: r.duplicates,
        lateUploads: r.lateUploads,
        auditCount: r.auditCount,
        enteredBy: user.email,
        updatedAt: now,
        hash: "",
      };
      const { stream: _s, date: _d, ...set } = row;
      await db.insert(schema.deliveryDaily).values(row).onConflictDoUpdate({ target: [schema.deliveryDaily.stream, schema.deliveryDaily.date], set });
    }
    await audit(user.email, "inventory", v.date, "saved", v.rows);
    await done(["/inventory", "/output"]);
    return { ok: true, message: `Inventory for ${v.date} saved` };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ attendance overrides (lead)

export async function setAttendance(employeeKey: string, date: string, code: string | null, note = ""): Promise<Result> {
  try {
    await requireAppMode();
    const me = await whoAmI(await currentUser());
    isoDate.parse(date);
    if (me.user.role === "viewer") throw new Error("Only leads and managers can change attendance.");
    if (!canActFor(me, await employee(employeeKey))) throw new Error("You can only change attendance for your team.");
    if (code !== null && !OVERRIDE_CODES.some((c) => c.value === code)) throw new Error(`Unknown attendance code "${code}"`);
    const db = await getDb();
    if (code === null) {
      await db.delete(schema.attendanceOverrides).where(and(eq(schema.attendanceOverrides.employeeKey, employeeKey), eq(schema.attendanceOverrides.date, date)));
    } else {
      const row = { employeeKey, date, code, note: note.slice(0, 500), setBy: me.user.email, setAt: nowIso() };
      await db.insert(schema.attendanceOverrides).values(row).onConflictDoUpdate({ target: [schema.attendanceOverrides.employeeKey, schema.attendanceOverrides.date], set: { code, note: row.note, setBy: row.setBy, setAt: row.setAt } });
    }
    await rebuildCalendar({ keys: [employeeKey], from: date, to: date });
    await audit(me.user.email, "attendance", `${employeeKey}|${date}`, code === null ? "cleared" : "set", { code, note });
    await done(["/attendance"]);
    return { ok: true, message: code === null ? "Back to the automatic value" : "Attendance updated" };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ roster (admin / manager)

const EmployeeInput = z.object({
  originalKey: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.string().trim().max(80).default(""),
  section: z.string().trim().min(1, "Choose a team").max(120),
  employeeCode: z.string().trim().max(20).default(""),
  weekOff: z.array(z.coerce.number().int().min(0).max(6)).max(6).default([0, 6]),
  workLocation: z.enum(["office", "wfh"]).default("office"),
  joinedOn: isoDate.optional().or(z.literal("")),
  leftOn: isoDate.optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
});

export async function saveEmployee(input: z.input<typeof EmployeeInput>): Promise<Result> {
  try {
    const user = await requireRole("manager");
    const v = EmployeeInput.parse(input);
    const email = normEmail(v.email);
    if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) throw new Error(`Use a @${ALLOWED_DOMAIN} email.`);
    if (v.leftOn && v.joinedOn && v.leftOn < v.joinedOn) throw new Error("The leaving date is before the joining date.");
    const db = await getDb();
    if (v.originalKey && v.originalKey !== email) throw new Error("The email can't be changed. Add the person again with the new email and set an end date on the old record.");
    const row = {
      key: email,
      email,
      name: v.name,
      role: v.role,
      section: v.section,
      isActive: v.isActive && !(v.leftOn && v.leftOn < todayIST()),
      employeeCode: v.employeeCode || null,
      weekOff: [...new Set(v.weekOff)].sort(),
      workLocation: v.workLocation,
      joinedOn: v.joinedOn || null,
      leftOn: v.leftOn || null,
      hash: "",
    };
    const { key: _k, ...set } = row;
    await db.insert(schema.employees).values(row).onConflictDoUpdate({ target: schema.employees.key, set });
    if ((await getDataMode()) === "app") await rebuildCalendar({ keys: [email] });
    await audit(user.email, "employee", email, v.originalKey ? "updated" : "created", row);
    await done(["/people"]);
    return { ok: true, message: `${v.name} saved` };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ holidays & targets (admin)

export async function saveHoliday(date: string, name: string): Promise<Result> {
  try {
    const user = await requireRole("admin");
    isoDate.parse(date);
    const n = name.trim().slice(0, 120);
    if (n.length < 2) throw new Error("Give the holiday a name");
    const db = await getDb();
    await db.insert(schema.holidays).values({ date, name: n, createdBy: user.email }).onConflictDoUpdate({ target: schema.holidays.date, set: { name: n } });
    if ((await getDataMode()) === "app") await rebuildCalendar({ from: date, to: date });
    await audit(user.email, "holiday", date, "saved", { name: n });
    await done(["/settings"]);
    return { ok: true, message: "Holiday saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHoliday(date: string): Promise<Result> {
  try {
    const user = await requireRole("admin");
    const db = await getDb();
    await db.delete(schema.holidays).where(eq(schema.holidays.date, date));
    if ((await getDataMode()) === "app") await rebuildCalendar({ from: date, to: date });
    await audit(user.email, "holiday", date, "deleted");
    await done(["/settings"]);
    return { ok: true, message: "Holiday removed" };
  } catch (e) {
    return fail(e);
  }
}

const TargetInput = z.object({
  method: z.string().trim().min(1).max(60),
  process: z.string().trim().min(1).max(80),
  perDay: z.coerce.number().positive("Target must be above 0").max(1000),
  range: z.string().trim().max(30).default(""),
  minutesPerWtg: z.union([z.coerce.number().positive().max(2000), z.literal("")]).optional(),
});

export async function saveTarget(input: z.input<typeof TargetInput>): Promise<Result> {
  try {
    await requireAppMode();
    const user = await requireRole("admin");
    const v = TargetInput.parse(input);
    const key = targetKey(v.method, v.process);
    const row = { key, method: v.method, process: v.process, images: "", range: v.range, perDay: v.perDay, minutesPerWtg: v.minutesPerWtg === "" || v.minutesPerWtg === undefined ? null : Number(v.minutesPerWtg), hash: "" };
    const db = await getDb();
    const { key: _k, ...set } = row;
    await db.insert(schema.targets).values(row).onConflictDoUpdate({ target: schema.targets.key, set });
    await audit(user.email, "target", key, "saved", row);
    await done(["/settings", "/output"]);
    return { ok: true, message: `Target ${v.method} · ${v.process} saved` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTarget(key: string): Promise<Result> {
  try {
    await requireAppMode();
    const user = await requireRole("admin");
    const db = await getDb();
    await db.delete(schema.targets).where(eq(schema.targets.key, key));
    await audit(user.email, "target", key, "deleted");
    await done(["/settings", "/output"]);
    return { ok: true, message: "Target removed" };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ go live: switch to in-app entry

export async function switchToAppMode(confirmText: string): Promise<Result> {
  try {
    const user = await requireRole("admin");
    if (confirmText.trim().toUpperCase() !== "START FRESH") throw new Error('Type START FRESH to confirm.');
    if ((await getDataMode()) === "app") throw new Error("In-app data entry is already on.");
    const db = await getDb();
    await db.transaction(async (tx) => {
      // Operational history starts empty (decision 25 Nov); roster, teams, targets, users, tasks and settings are kept.
      await tx.delete(schema.outputSubmissions);
      await tx.delete(schema.calendarDays);
      await tx.delete(schema.leaveRequests);
      await tx.delete(schema.deliveryDaily);
      await tx.delete(schema.overtimeEntries);
      await tx.delete(schema.referenceValues);
      await tx.delete(schema.syncIssues);
      await tx.delete(schema.alerts);
      // People who were only known from old records (not on the roster) are not carried over.
      await tx.delete(schema.employees).where(and(eq(schema.employees.section, "Not in Calendar View"), ne(schema.employees.isActive, true)));
      await setDataMode("app", user.email, tx as never);
    });
    await rebuildCalendar();
    await audit(user.email, "mode", "app", "switched", { startFresh: true });
    await done(["/data-sources", "/settings"]);
    return { ok: true, message: "In-app data entry is on. The sheet sync has stopped." };
  } catch (e) {
    return fail(e);
  }
}
