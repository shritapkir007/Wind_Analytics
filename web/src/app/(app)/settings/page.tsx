import { desc } from "drizzle-orm";
import { can, currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { ALERT_KINDS, getSettings } from "@/lib/domain/settings";
import { getDataset } from "@/lib/domain/dataset";
import { Badge, Card, CardBody, CardHeader, PageHeader, input } from "@/components/ui";
import { AddUser, RoleSelect, SettingsForm } from "@/components/admin-client";
import { ALLOWED_DOMAIN } from "@/lib/config";

export const dynamic = "force-dynamic";

function Num({ name, label, value, hint, suffix }: { name: string; label: string; value: number; hint?: string; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
      {label}
      <span className="flex items-center gap-2">
        <input name={name} type="number" step="any" defaultValue={value} className={`${input} w-28`} required />
        {suffix && <span className="text-muted">{suffix}</span>}
      </span>
      {hint && <span className="text-[11.5px] text-muted">{hint}</span>}
    </label>
  );
}

export default async function Settings() {
  const user = await currentUser();
  const admin = can(user, "admin");
  const s = await getSettings();
  const ds = await getDataset();
  const db = await getDb();
  const users = await db.select().from(schema.users).orderBy(desc(schema.users.lastLogin));
  const fieldset = admin ? "" : "pointer-events-none opacity-70";

  return (
    <div className="fade-in">
      <PageHeader title="Settings" subtitle={admin ? "Changes apply immediately and re-evaluate alerts." : "Read-only: only admins can change settings."} />

      <SettingsForm>
        <fieldset disabled={!admin} className={`grid gap-4 xl:grid-cols-2 ${fieldset}`}>
          <Card>
            <CardHeader title="Alert thresholds" />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <Num name="lowDailyProductivityPct" label="Low daily output below" value={s.thresholds.lowDailyProductivityPct} suffix="% productivity" />
                <Num name="weeklyTargetPct" label="Missed weekly target below" value={s.thresholds.weeklyTargetPct} suffix="%" />
                <Num name="inventoryRisePct" label="Inventory rising more than" value={s.thresholds.inventoryRisePct} suffix="%" />
                <Num name="inventoryRiseDays" label="…over working days" value={s.thresholds.inventoryRiseDays} suffix="days" />
                <Num name="qualityIssuesMax" label="Quality issues high above" value={s.thresholds.qualityIssuesMax} suffix="open QI per stream" />
                <Num name="noOutputGraceDays" label="No-output grace period" value={s.thresholds.noOutputGraceDays} suffix="days" hint="Days to wait before flagging a missing User Input entry" />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Ranking rule" subtitle="Who is included in productivity rankings" />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <Num name="minCoveragePct" label="Minimum target coverage" value={s.ranking.minCoveragePct} suffix="%" hint="Share of output in processes that have a target" />
                <Num name="minPresentDays" label="Minimum present days" value={s.ranking.minPresentDays} suffix="days" />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Alert types" subtitle="Turn individual alerts on or off" />
            <CardBody>
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(ALERT_KINDS).map(([k, a]) => (
                  <li key={k}>
                    <label className="flex items-start gap-2 text-[13px]">
                      <input type="checkbox" name={`alert_${k}`} defaultChecked={s.enabledAlerts[k] !== false} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                      <span>
                        <span className="font-medium text-ink">{a.label}</span>
                        <span className="block text-[12px] text-ink-2">{a.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notification channels" subtitle="Critical and warning alerts are pushed only when a channel is enabled here AND its webhook is configured on the server" />
            <CardBody>
              <ul className="flex flex-col gap-3 text-[13px]">
                {[
                  ["slack", "Slack", s.notifications.slack.enabled, s.notifications.slack.webhookConfigured, "SLACK_WEBHOOK_URL"],
                  ["teams", "Microsoft Teams", s.notifications.teams.enabled, s.notifications.teams.webhookConfigured, "TEAMS_WEBHOOK_URL"],
                ].map(([k, l, en, conf, env]) => (
                  <li key={String(k)} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name={`notify_${k}`} defaultChecked={Boolean(en)} className="h-4 w-4 accent-[var(--accent)]" />
                      <span className="font-medium text-ink">{String(l)}</span>
                    </label>
                    {conf ? <Badge tone="good">Webhook configured</Badge> : <Badge>Set {String(env)} on the server</Badge>}
                  </li>
                ))}
                <li className="rounded-xl border border-dashed border-line-strong p-3 text-ink-2">Email and WhatsApp need an authorised provider (e.g. Google Workspace SMTP relay, WhatsApp Business API). The channel interface is ready in <code>src/lib/notify.ts</code>.</li>
              </ul>
            </CardBody>
          </Card>
        </fieldset>
      </SettingsForm>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Productivity targets" subtitle="Read from the Target tab on every sync — edit them in the sheet, not here" />
          <CardBody>
            <table className="w-full text-[13px]">
              <thead className="text-left text-[12px] text-ink-2">
                <tr>
                  <th className="pb-2 font-medium">Process column</th>
                  <th className="pb-2 font-medium">Target row</th>
                  <th className="pb-2 text-right font-medium">WTG/day</th>
                </tr>
              </thead>
              <tbody>
                {[...ds.processes.values()]
                  .filter((p) => p.inProductivity)
                  .map((p) => (
                    <tr key={p.column} className="border-t border-line">
                      <td className="py-2 text-ink">{p.label}</td>
                      <td className="py-2 text-ink-2">{p.target.source}</td>
                      <td className="tnum py-2 text-right">{p.target.perDay ?? <Badge tone="warning">missing</Badge>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] text-muted">Excluded from productivity (counted as output only): {[...ds.processes.values()].filter((p) => !p.inProductivity).map((p) => p.label).join(", ")}.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Users & roles" subtitle={`Sign-in is limited to verified @${ALLOWED_DOMAIN} Google accounts`} />
          <CardBody>
            <dl className="mb-4 grid gap-2 text-[12.5px] text-ink-2 sm:grid-cols-2">
              <div><dt className="font-medium text-ink">Viewer</dt><dd>Read every dashboard and export reports</dd></div>
              <div><dt className="font-medium text-ink">Lead</dt><dd>+ create / update tasks, acknowledge alerts</dd></div>
              <div><dt className="font-medium text-ink">Manager</dt><dd>+ delete tasks, run a manual sync</dd></div>
              <div><dt className="font-medium text-ink">Admin</dt><dd>+ settings, thresholds and user roles</dd></div>
            </dl>
            {admin && (
              <div className="mb-4">
                <AddUser domain={ALLOWED_DOMAIN} />
              </div>
            )}
            <ul className="flex flex-col">
              {users.map((u) => (
                <li key={u.email} className="flex items-center justify-between gap-2 border-b border-line py-2 text-[13px] last:border-0">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{u.name ?? u.email}</span>
                    <span className="block truncate text-[12px] text-ink-2">
                      {u.email} · last login {u.lastLogin ? u.lastLogin.slice(0, 10) : "never"}
                    </span>
                  </span>
                  {admin ? <RoleSelect email={u.email} role={u.role} /> : <Badge>{u.role}</Badge>}
                </li>
              ))}
              {users.length === 0 && <li className="text-[13px] text-muted">Users appear here after they sign in, or add them above.</li>}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
