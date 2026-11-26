"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { nowIso } from "@/lib/config";
import { runSync } from "@/lib/sync/run";
import { refreshAlerts } from "@/lib/domain/alerts";
import { ALERT_KINDS, getSettings, saveSettings } from "@/lib/domain/settings";

export async function syncNow(mode: "quick" | "full") {
  const user = await requireRole("manager");
  const r = await runSync({ mode, trigger: "manual", triggeredBy: user.email });
  revalidatePath("/", "layout");
  return { status: r.status, error: r.error ?? null, issues: r.issues };
}

export async function acknowledgeAlert(key: string) {
  const user = await requireRole("lead");
  const db = await getDb();
  await db.update(schema.alerts).set({ acknowledgedBy: user.email, acknowledgedAt: nowIso() }).where(eq(schema.alerts.key, key));
  revalidatePath("/alerts");
}

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const SettingsForm = z.object({
  lowDailyProductivityPct: num(0, 500),
  weeklyTargetPct: num(0, 500),
  inventoryRisePct: num(0, 1000),
  inventoryRiseDays: num(1, 60),
  qualityIssuesMax: num(0, 100000),
  noOutputGraceDays: num(0, 14),
  minCoveragePct: num(0, 100),
  minPresentDays: num(0, 31),
  selfEditDays: num(0, 60),
  zohoLeaveUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || /^https:\/\/[^\s]+$/i.test(u), "Zoho link must start with https://")
    .default(""),
});

export async function updateSettings(_: { ok: boolean; error?: string }, fd: FormData) {
  try {
    const user = await requireRole("admin");
    const parsed = SettingsForm.safeParse(Object.fromEntries(fd.entries()));
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const cur = await getSettings();
    const d = parsed.data;
    const enabledAlerts = Object.fromEntries(Object.keys(ALERT_KINDS).map((k) => [k, fd.get(`alert_${k}`) === "on"]));
    await saveSettings(
      {
        thresholds: { lowDailyProductivityPct: d.lowDailyProductivityPct, weeklyTargetPct: d.weeklyTargetPct, inventoryRisePct: d.inventoryRisePct, inventoryRiseDays: d.inventoryRiseDays, qualityIssuesMax: d.qualityIssuesMax, noOutputGraceDays: d.noOutputGraceDays },
        ranking: { minCoveragePct: d.minCoveragePct, minPresentDays: d.minPresentDays },
        entry: { selfEditDays: d.selfEditDays, zohoLeaveUrl: d.zohoLeaveUrl },
        enabledAlerts,
        notifications: {
          ...cur.notifications,
          slack: { ...cur.notifications.slack, enabled: fd.get("notify_slack") === "on" },
          teams: { ...cur.notifications.teams, enabled: fd.get("notify_teams") === "on" },
        },
      },
      user.email,
    );
    await refreshAlerts();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setUserRole(email: string, role: string) {
  const user = await requireRole("admin");
  if (!["viewer", "lead", "manager", "admin"].includes(role)) throw new Error("Invalid role");
  if (email === user.email && role !== "admin") throw new Error("You cannot remove your own admin role");
  const db = await getDb();
  await db.update(schema.users).set({ role }).where(eq(schema.users.email, email));
  revalidatePath("/settings");
}

export async function addUser(_: { ok: boolean; error?: string }, fd: FormData) {
  try {
    await requireRole("admin");
    const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "zeitview.com").toLowerCase();
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const role = String(fd.get("role") ?? "viewer");
    if (!email.endsWith(`@${domain}`)) return { ok: false, error: `Only @${domain} addresses can be added` };
    if (!["viewer", "lead", "manager", "admin"].includes(role)) return { ok: false, error: "Invalid role" };
    const db = await getDb();
    await db.insert(schema.users).values({ email, role }).onConflictDoUpdate({ target: schema.users.email, set: { role } });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
