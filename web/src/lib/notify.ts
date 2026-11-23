import "server-only";
import type { AlertDraft } from "./domain/alerts";
import type { AppSettings } from "./domain/settings";

/**
 * Outbound notification channels. Nothing is sent unless the channel is BOTH enabled in Settings
 * and configured with its webhook in the server environment. New channels (email, WhatsApp…)
 * implement the same interface.
 */
export interface NotificationChannel {
  id: "slack" | "teams" | "email";
  ready(s: AppSettings): boolean;
  send(alerts: AlertDraft[], s: AppSettings): Promise<void>;
}

const appUrl = () => process.env.APP_URL ?? "";
const lines = (alerts: AlertDraft[]) =>
  alerts.slice(0, 20).map((a) => `• [${a.severity}] ${a.title} — ${a.message}`).join("\n") + (alerts.length > 20 ? `\n…and ${alerts.length - 20} more` : "");

const slack: NotificationChannel = {
  id: "slack",
  ready: (s) => s.notifications.slack.enabled && Boolean(process.env.SLACK_WEBHOOK_URL),
  async send(alerts) {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `*Wind Ops — ${alerts.length} new alert(s)*\n${lines(alerts)}\n${appUrl()}/alerts` }),
    });
  },
};

const teams: NotificationChannel = {
  id: "teams",
  ready: (s) => s.notifications.teams.enabled && Boolean(process.env.TEAMS_WEBHOOK_URL),
  async send(alerts) {
    await fetch(process.env.TEAMS_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `**Wind Ops — ${alerts.length} new alert(s)**\n\n${lines(alerts).replace(/\n/g, "\n\n")}` }),
    });
  },
};

// Email needs an authorised provider (SMTP / SendGrid / Google Workspace relay). Not wired yet.
const email: NotificationChannel = {
  id: "email",
  ready: () => false,
  async send() {},
};

const CHANNELS = [slack, teams, email];

export async function dispatchNotifications(alerts: AlertDraft[], s: AppSettings) {
  const important = alerts.filter((a) => a.severity !== "info");
  if (!important.length) return;
  for (const c of CHANNELS) {
    if (!c.ready(s)) continue;
    try {
      await c.send(important, s);
    } catch (e) {
      console.error(`notification channel ${c.id} failed`, e);
    }
  }
}
