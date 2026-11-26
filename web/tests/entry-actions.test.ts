// Integration tests: real server actions against an in-memory Postgres (PGlite).
// The signed-in user is switched per test through the mocked currentUser().

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = ":memory:";
process.env.APP_TODAY = "2026-11-25"; // Wednesday
process.env.ALLOWED_EMAIL_DOMAIN = "zeitview.com";

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));

type Role = "viewer" | "lead" | "manager" | "admin";
let me: { email: string; name: string; role: Role } = { email: "admin@zeitview.com", name: "Admin", role: "admin" };
vi.mock("@/auth", () => {
  const RANK = { viewer: 0, lead: 1, manager: 2, admin: 3 } as const;
  return {
    currentUser: async () => me,
    requireRole: async (min: Role) => {
      if (RANK[me.role] < RANK[min]) throw new Error(`This action needs the ${min} role (you are ${me.role}).`);
      return me;
    },
    can: (u: typeof me, min: Role) => RANK[u.role] >= RANK[min],
  };
});

const as = (email: string, role: Role) => (me = { email, name: email.split("@")[0], role });

// Imported after the mocks.
const A = await import("@/app/(app)/entry-actions");
const { getDb, schema } = await import("@/lib/db");
const { getDataset } = await import("@/lib/domain/dataset");
const { and, eq } = await import("drizzle-orm");

async function rows<T>(q: Promise<T[]>) {
  return q;
}

beforeAll(async () => {
  const db = await getDb();
  // Roster as it would be after the sheet era: kept on switch.
  await db.insert(schema.employees).values([
    { key: "asha@zeitview.com", email: "asha@zeitview.com", name: "Asha", role: "Engineer", section: "Wind Team", isActive: true, employeeCode: null, hash: "" },
    { key: "lead.wind@zeitview.com", email: "lead.wind@zeitview.com", name: "Wind Lead", role: "Team Lead", section: "GWO ", isActive: true, employeeCode: null, hash: "" },
    { key: "enc@zeitview.com", email: "enc@zeitview.com", name: "Encord Person", role: "Analyst", section: "Encord Project", isActive: true, employeeCode: null, hash: "" },
  ]);
  await db.insert(schema.outputSubmissions).values({ employeeKey: "asha@zeitview.com", date: "2026-11-02", submittedAt: null, addedBy: null, entryStatus: "Updated", otherWork: null, leadNote: null, sourceRow: 5, entries: { Ext_FQC: 3 }, hash: "x" });
  await db.insert(schema.targets).values({ key: "external|fqc", method: "External", process: "FQC", images: "", range: "10-12", perDay: 11, minutesPerWtg: 33, hash: "" });
});

beforeEach(() => as("admin@zeitview.com", "admin"));

describe("go-live switch", () => {
  it("refuses entries before the switch, then starts fresh and keeps roster + targets", async () => {
    as("asha@zeitview.com", "viewer");
    expect((await A.saveOutput({ employeeKey: "asha@zeitview.com", date: "2026-11-25", entries: { Ext_FQC: 5 } })).error).toMatch(/not switched on/);

    as("asha@zeitview.com", "viewer");
    expect((await A.switchToAppMode("START FRESH")).error).toMatch(/admin/);
    as("admin@zeitview.com", "admin");
    expect((await A.switchToAppMode("yes")).error).toMatch(/START FRESH/);
    expect(await A.switchToAppMode("START FRESH")).toMatchObject({ ok: true });

    const db = await getDb();
    expect(await rows(db.select().from(schema.outputSubmissions))).toHaveLength(0);
    expect(await rows(db.select().from(schema.employees))).toHaveLength(3);
    expect(await rows(db.select().from(schema.targets))).toHaveLength(1);
    // calendar generated for everyone: Wed 25 Nov is a normal office day
    const [cal] = await db.select().from(schema.calendarDays).where(eq(schema.calendarDays.date, "2026-11-25"));
    expect(cal).toMatchObject({ category: "present" });
  });
});

describe("daily output", () => {
  it("lets people log their own output once per day and refreshes the dashboards", async () => {
    as("asha@zeitview.com", "viewer");
    expect(await A.saveOutput({ employeeKey: "asha@zeitview.com", date: "2026-11-25", entries: { Ext_FQC: 11, "Critical Review": 0 }, otherWork: "1 QI resolved" })).toMatchObject({ ok: true });
    expect(await A.saveOutput({ employeeKey: "asha@zeitview.com", date: "2026-11-25", entries: { Ext_FQC: 12 } })).toMatchObject({ ok: true });
    const ds = await getDataset();
    const subs = ds.submissions.filter((s) => s.employeeKey === "asha@zeitview.com");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ date: "2026-11-25", entries: { Ext_FQC: 12 }, entryStatus: "Edited" });
    // Delivered (External) is calculated from Ext_FQC
    expect(ds.delivery.find((d) => d.stream === "External" && d.date === "2026-11-25")?.delivered).toBe(12);
  });

  it("blocks other people's output, future dates, old days and unknown processes", async () => {
    as("asha@zeitview.com", "viewer");
    expect((await A.saveOutput({ employeeKey: "enc@zeitview.com", date: "2026-11-25", entries: { Ext_FQC: 1 } })).error).toMatch(/only log output for yourself/);
    expect((await A.saveOutput({ employeeKey: "asha@zeitview.com", date: "2026-11-26", entries: { Ext_FQC: 1 } })).error).toMatch(/future/);
    expect((await A.saveOutput({ employeeKey: "asha@zeitview.com", date: "2026-11-01", entries: { Ext_FQC: 1 } })).error).toMatch(/last 7 days/);
    expect((await A.saveOutput({ employeeKey: "asha@zeitview.com", date: "2026-11-25", entries: { Hacking: 1 } })).error).toMatch(/Unknown process/);
  });

  it("lets a lead enter output for their own team only", async () => {
    as("lead.wind@zeitview.com", "lead");
    expect(await A.saveOutput({ employeeKey: "asha@zeitview.com", date: "2026-11-01", entries: { Ext_FQC: 4 } })).toMatchObject({ ok: true });
    expect((await A.saveOutput({ employeeKey: "enc@zeitview.com", date: "2026-11-24", entries: { Ext_FQC: 4 } })).error).toMatch(/your team/);
  });
});

describe("leave requests", () => {
  it("goes Pending → Approved by the team lead and updates the calendar", async () => {
    as("asha@zeitview.com", "viewer");
    const r = await A.requestLeave({ employeeKey: "asha@zeitview.com", type: "EL", startDate: "2026-11-27", endDate: "2026-11-30", reason: "Family function" });
    expect(r).toMatchObject({ ok: true });
    const id = r.message!.match(/LR-\w+/)![0];
    // overlapping second request is refused
    expect((await A.requestLeave({ employeeKey: "asha@zeitview.com", type: "CL", startDate: "2026-11-30", endDate: "2026-11-30", reason: "x y" })).error).toMatch(/overlap/);
    // nobody approves their own request; a lead from another team can't either
    expect((await A.decideLeave(id, "Approved")).error).toMatch(/can't approve/);
    as("enc@zeitview.com", "lead");
    expect((await A.decideLeave(id, "Approved")).error).toMatch(/can't approve/);
    as("lead.wind@zeitview.com", "lead");
    expect(await A.decideLeave(id, "Approved", "Enjoy")).toMatchObject({ ok: true });

    const db = await getDb();
    const cal = await db.select().from(schema.calendarDays).where(eq(schema.calendarDays.employeeKey, "asha@zeitview.com"));
    const code = (d: string) => cal.find((c) => c.date === d)?.rawCode;
    expect([code("2026-11-27"), code("2026-11-28"), code("2026-11-29"), code("2026-11-30")]).toEqual(["EL", "Week Off", "Week Off", "EL"]);
    const ds = await getDataset();
    expect(ds.leave.find((l) => l.workflowId === id)).toMatchObject({ approvalStatus: "Approved", effective: true, reviewedBy: "lead.wind@zeitview.com" });
  });

  it("marks approved leave as applied in Zoho (own or team only, approved only)", async () => {
    as("asha@zeitview.com", "viewer");
    const r = await A.requestLeave({ employeeKey: "asha@zeitview.com", type: "CL", startDate: "2026-12-07", endDate: "2026-12-07", reason: "Errand" });
    const id = r.message!.match(/LR-\w+/)![0];
    expect((await A.markZohoApplied(id, true)).error).toMatch(/Only approved/);
    as("lead.wind@zeitview.com", "lead");
    await A.decideLeave(id, "Approved");
    as("enc@zeitview.com", "viewer");
    expect((await A.markZohoApplied(id, true)).error).toMatch(/your own/);
    as("asha@zeitview.com", "viewer");
    expect(await A.markZohoApplied(id, true)).toMatchObject({ ok: true });
    const db = await getDb();
    const [l] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.workflowId, id));
    expect(l.zohoApplied).toBe("Yes");
    expect(await A.markZohoApplied(id, false)).toMatchObject({ ok: true });
  });

  it("supports half days and cancelling, and refuses requests that need no leave", async () => {
    as("asha@zeitview.com", "viewer");
    const r = await A.requestLeave({ employeeKey: "asha@zeitview.com", type: "CL", startDate: "2026-12-02", endDate: "2026-12-02", halfDay: "first", unplanned: true, reason: "Doctor" });
    const id = r.message!.match(/LR-\w+/)![0];
    as("lead.wind@zeitview.com", "lead");
    await A.decideLeave(id, "Approved");
    const db = await getDb();
    const ashaOn = (d: string) => and(eq(schema.calendarDays.employeeKey, "asha@zeitview.com"), eq(schema.calendarDays.date, d));
    const [day] = await db.select().from(schema.calendarDays).where(ashaOn("2026-12-02"));
    expect(day).toMatchObject({ rawCode: "First Half CL", presence: 0.5 });
    as("asha@zeitview.com", "viewer");
    expect(await A.cancelLeave(id)).toMatchObject({ ok: true });
    const [after] = await db.select().from(schema.calendarDays).where(ashaOn("2026-12-02"));
    expect(after.rawCode).toBe("");
    expect((await A.requestLeave({ employeeKey: "asha@zeitview.com", type: "EL", startDate: "2026-12-05", endDate: "2026-12-06", reason: "Weekend" })).error).toMatch(/week offs or holidays/);
  });
});

describe("overtime, holidays, attendance and inventory", () => {
  it("approved OT turns a week off into a working day", async () => {
    as("asha@zeitview.com", "viewer");
    const r = await A.logOvertime({ employeeKey: "asha@zeitview.com", date: "2026-11-21", process: "Ext FQC", timeStart: "09:30", timeEnd: "18:30", shift: "Full Day", turbines: "10 FQC" });
    const id = r.message!.match(/OT-\w+/)![0];
    let ds = await getDataset();
    expect(ds.overtime.find((o) => o.rowKey === id)).toBeUndefined(); // pending OT is not counted
    as("lead.wind@zeitview.com", "lead");
    expect(await A.decideOvertime(id, "Approved")).toMatchObject({ ok: true });
    ds = await getDataset();
    expect(ds.overtime.find((o) => o.rowKey === id)).toMatchObject({ turbinesParsed: 10 });
    expect(ds.calendar.get("asha@zeitview.com|2026-11-21")).toMatchObject({ rawCode: "Working", presence: 1 });
  });

  it("holidays and lead overrides change the calendar", async () => {
    expect(await A.saveHoliday("2026-12-25", "Christmas")).toMatchObject({ ok: true });
    as("lead.wind@zeitview.com", "lead");
    expect(await A.setAttendance("asha@zeitview.com", "2026-11-24", "LoP", "No show")).toMatchObject({ ok: true });
    expect((await A.setAttendance("enc@zeitview.com", "2026-11-24", "LoP")).error).toMatch(/your team/);
    const ds = await getDataset();
    expect(ds.calendar.get("enc@zeitview.com|2026-12-25")).toMatchObject({ category: "holiday" });
    expect(ds.calendar.get("asha@zeitview.com|2026-11-24")).toMatchObject({ category: "lop" });
  });

  it("records inventory; delivered is calculated unless typed in", async () => {
    as("asha@zeitview.com", "viewer");
    expect((await A.saveInventory({ date: "2026-11-25", rows: [{ stream: "External", uploaded: 5 }] })).error).toMatch(/lead/);
    as("lead.wind@zeitview.com", "lead");
    expect(await A.saveInventory({ date: "2026-11-25", rows: [{ stream: "External", uploaded: 20, inventory: 250, qualityIssues: 30, delivered: "" }, { stream: "ZDT", uploaded: 3, inventory: 40, delivered: 7 }] })).toMatchObject({ ok: true });
    const ds = await getDataset();
    expect(ds.delivery.find((d) => d.stream === "External" && d.date === "2026-11-25")).toMatchObject({ delivered: 12, inventory: 250, uploaded: 20 });
    expect(ds.delivery.find((d) => d.stream === "ZDT" && d.date === "2026-11-25")).toMatchObject({ delivered: 7 });
  });

  it("keeps an audit trail of every change", async () => {
    const db = await getDb();
    const events = await db.select().from(schema.auditEvents);
    const kinds = new Set(events.map((e) => `${e.entity}:${e.action}`));
    for (const k of ["mode:switched", "output:created", "output:updated", "leave:requested", "leave:approved", "leave:cancelled", "overtime:approved", "holiday:saved", "attendance:set", "inventory:saved"]) expect(kinds).toContain(k);
  });
});

describe("roster", () => {
  it("adds people, refuses duplicates, and edits records that came from the sheets", async () => {
    const db = await getDb();
    await db.insert(schema.employees).values({ key: "name:ravi", email: null, name: "Ravi", role: "", section: "Wind Team", isActive: true, employeeCode: null, hash: "" });
    as("lead.wind@zeitview.com", "lead");
    expect((await A.saveEmployee({ name: "New", email: "new@zeitview.com", section: "Wind Team" })).error).toMatch(/manager/);
    as("admin@zeitview.com", "admin");
    expect(await A.saveEmployee({ name: "New Person", email: "new@zeitview.com", section: "Wind Team", weekOff: [0], workLocation: "wfh" })).toMatchObject({ ok: true });
    expect((await A.saveEmployee({ name: "Again", email: "new@zeitview.com", section: "Wind Team" })).error).toMatch(/already on the roster/);
    expect((await A.saveEmployee({ name: "Xavier", email: "x@gmail.com", section: "Wind Team" })).error).toMatch(/@zeitview.com/);
    // a sheet-era record keyed by name keeps its key when an email is added
    expect(await A.saveEmployee({ originalKey: "name:ravi", name: "Ravi K", email: "ravi@zeitview.com", section: "Wind Team" })).toMatchObject({ ok: true });
    const [ravi] = await db.select().from(schema.employees).where(eq(schema.employees.key, "name:ravi"));
    expect(ravi).toMatchObject({ name: "Ravi K", email: "ravi@zeitview.com" });
    expect((await A.saveEmployee({ originalKey: "name:ravi", name: "Ravi K", email: "other@zeitview.com", section: "Wind Team" })).error).toMatch(/can't be changed/);
    // Saturday is a working day for the new WFH person (only Sunday off)
    const [sat] = await db.select().from(schema.calendarDays).where(and(eq(schema.calendarDays.employeeKey, "new@zeitview.com"), eq(schema.calendarDays.date, "2026-11-28")));
    expect(sat).toMatchObject({ rawCode: "WFH" });
  });
});

describe("productivity targets", () => {
  it("defaults to the agreed table, admins edit ranges, upper end counts", async () => {
    let ds = await getDataset();
    expect(ds.processes.get("Ext_FQC")!.target.perDay).toBe(12);
    as("lead.wind@zeitview.com", "lead");
    expect((await A.saveProcessTargets({ Ext_FQC: "10-14" })).error).toMatch(/admin/);
    as("admin@zeitview.com", "admin");
    expect((await A.saveProcessTargets({ Ext_FQC: "12-10" })).error).toMatch(/low to high/);
    expect((await A.saveProcessTargets({ Ext_FQC: "ten" })).error).toMatch(/range like 10-12/);
    expect((await A.saveProcessTargets({ "Critical Review": "5" })).error).toMatch(/Unknown process/);
    expect(await A.saveProcessTargets({ Ext_FQC: "10 - 14", "ZDT FQC": "12" })).toMatchObject({ ok: true });
    ds = await getDataset();
    expect(ds.processes.get("Ext_FQC")!.target).toMatchObject({ perDay: 14, range: "10-14" });
    expect(ds.processes.get("Ext_Analysis")!.target.perDay).toBeNull(); // not in the saved table
  });
});
