import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { nowIso } from "../config";

export interface AlertThresholds {
  lowDailyProductivityPct: number;
  weeklyTargetPct: number;
  inventoryRisePct: number;
  inventoryRiseDays: number;
  qualityIssuesMax: number;
  noOutputGraceDays: number;
}

export interface AppSettings {
  thresholds: AlertThresholds;
  enabledAlerts: Record<string, boolean>;
  ranking: { minCoveragePct: number; minPresentDays: number };
  /** In-app entry: how many past days people may still edit their own output. */
  entry: { selfEditDays: number };
  notifications: { email: { enabled: boolean; recipients: string[] }; slack: { enabled: boolean; webhookConfigured: boolean }; teams: { enabled: boolean; webhookConfigured: boolean } };
}

export const ALERT_KINDS: Record<string, { label: string; description: string }> = {
  on_leave_today: { label: "On leave today", description: "Everyone with a leave code in Calendar View today" },
  unplanned_absence: { label: "Absent (LoP)", description: "Marked LoP in Calendar View today. Unplanned leave counts as leave (see 'On leave today')." },
  low_daily_output: { label: "Low daily output", description: "Productivity for a working day below the threshold" },
  missed_weekly_target: { label: "Missed weekly target", description: "Last full week's productivity below the threshold" },
  no_output_logged: { label: "No output logged", description: "Present on a working day but no User Input entry after the grace period" },
  inventory_rising: { label: "Inventory rising", description: "Pending inventory up by more than the threshold over N working days" },
  quality_issues_high: { label: "Quality issues high", description: "Open quality issues (Active ZV) above the threshold" },
  overdue_task: { label: "Overdue task", description: "Task past its due date and not completed" },
  sync_failed: { label: "Data sync failure", description: "The latest sync failed or partially failed" },
  data_quality: { label: "Data-quality errors", description: "Error-level issues found in the latest sync" },
};

export const DEFAULT_SETTINGS: AppSettings = {
  thresholds: { lowDailyProductivityPct: 60, weeklyTargetPct: 80, inventoryRisePct: 15, inventoryRiseDays: 5, qualityIssuesMax: 150, noOutputGraceDays: 1 },
  enabledAlerts: Object.fromEntries(Object.keys(ALERT_KINDS).map((k) => [k, true])),
  ranking: { minCoveragePct: 70, minPresentDays: 5 },
  entry: { selfEditDays: 7 },
  notifications: {
    email: { enabled: false, recipients: [] },
    slack: { enabled: false, webhookConfigured: Boolean(process.env.SLACK_WEBHOOK_URL) },
    teams: { enabled: false, webhookConfigured: Boolean(process.env.TEAMS_WEBHOOK_URL) },
  },
};

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "app"));
  const v = (row?.value ?? {}) as Partial<AppSettings>;
  return {
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...v.thresholds },
    enabledAlerts: { ...DEFAULT_SETTINGS.enabledAlerts, ...v.enabledAlerts },
    ranking: { ...DEFAULT_SETTINGS.ranking, ...v.ranking },
    entry: { ...DEFAULT_SETTINGS.entry, ...v.entry },
    notifications: {
      email: { ...DEFAULT_SETTINGS.notifications.email, ...v.notifications?.email },
      slack: { ...DEFAULT_SETTINGS.notifications.slack, enabled: Boolean(v.notifications?.slack?.enabled) },
      teams: { ...DEFAULT_SETTINGS.notifications.teams, enabled: Boolean(v.notifications?.teams?.enabled) },
    },
  };
}

export async function saveSettings(next: AppSettings, by: string) {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key: "app", value: next, updatedBy: by, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next, updatedBy: by, updatedAt: nowIso() } });
}
