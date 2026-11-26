import { desc } from "drizzle-orm";
import { can, currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { ALERT_KINDS, getProcessTargets, getSettings } from "@/lib/domain/settings";
import { getDataset } from "@/lib/domain/dataset";
import { Badge, Card, CardBody, CardHeader, PageHeader, input } from "@/components/ui";
import { AddUser, RoleSelect, SettingsForm } from "@/components/admin-client";
import { ALLOWED_DOMAIN } from "@/lib/config";
import { getDataMode } from "@/lib/entry/store";
import { BackToSheetsSwitch, GoLiveSwitch, HolidayManager, ProcessTargetsForm } from "@/components/entry/forms";
import { PROCESSES } from "@/lib/processes";

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
  const mode = await getDataMode();
  const [holidays, pt] = await Promise.all([db.select().from(schema.holidays).orderBy(schema.holidays.date), getProcessTargets()]);

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
                <Num name="selfEditDays" label="People can edit their own output for" value={s.entry.selfEditDays} suffix="past days" hint="In-app data entry: older days need a lead" />
                <label className="flex flex-col gap-1 text-[12.5px] text-ink-2 sm:col-span-2">
                  Zoho People leave page
                  <input name="zohoLeaveUrl" type="url" defaultValue={s.entry.zohoLeaveUrl} placeholder="https://people.zoho.in/…" className={input} />
                  <span className="text-[11.5px] text-muted">Approved leave shows an &ldquo;Apply in Zoho&rdquo; button that opens this page. Open the leave application page in Zoho People and paste its address here. Leave empty to hide the button.</span>
                </label>
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

      <Card className="mt-6" id="data-entry">
        <CardHeader
          title="Data entry"
          subtitle={mode === "app" ? "Live: everything is entered in this app. The Google Sheets are no longer read." : "Currently reading the Google Sheets on every sync."}
          actions={mode === "app" ? <Badge tone="good">In-app entry</Badge> : <Badge>Google Sheets</Badge>}
        />
        <CardBody>
          {mode === "sheets" ? (
            admin ? (
              <div className="flex flex-col gap-3 text-[13px] text-ink-2">
                <p>
                  Switching on in-app entry makes this app the only source: people log their own output, leave and overtime under <strong className="text-ink">My workspace</strong>, leads approve under <strong className="text-ink">Approvals</strong> and record <strong className="text-ink">Inventory</strong>, and managers keep the roster in <strong className="text-ink">People &amp; Teams</strong>.
                </p>
                <p>
                  <strong className="text-critical">Start fresh:</strong> the roster, teams and targets are kept; all output, attendance, leave, overtime and inventory history imported from the sheets is removed from the app (the sheets themselves are never changed). The sheet sync stops. For a trial run you can come back with &ldquo;Switch back to Google Sheets&rdquo;, which reloads everything from the sheets.
                </p>
                <GoLiveSwitch />
              </div>
            ) : (
              <p className="text-[13px] text-ink-2">An admin can switch on in-app data entry here.</p>
            )
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Public holidays</h3>
                <p className="mb-3 text-[12.5px] text-ink-2">Holidays are days off for everyone; overtime approved on a holiday marks it as Working.</p>
                {admin ? <HolidayManager holidays={holidays} /> : <ul className="text-[13px]">{holidays.map((h) => <li key={h.date}>{h.date} · {h.name}</li>)}</ul>}
              </div>
              <div>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">How the calendar is built</h3>
                <ul className="list-disc pl-5 text-[12.5px] text-ink-2">
                  <li>Every active person is present on their working days, at the office or from home as set in People &amp; Teams.</li>
                  <li>Weekly days off and public holidays are days off; approved overtime or an approved working-day request on them marks the day Working.</li>
                  <li>Approved leave (full or half day) and WFH requests apply automatically.</li>
                  <li>A lead can mark a day by hand (e.g. LoP) on the Attendance page; that wins over everything else.</li>
                </ul>
              </div>
              {admin && (
                <div className="rounded-xl border border-line p-4 xl:col-span-2">
                  <h3 className="mb-1 text-[13px] font-semibold text-ink">Trial run? Switch back to the Google Sheets</h3>
                  <p className="mb-3 text-[12.5px] text-ink-2">
                    Reloads everything from the sheets (they were never changed). Anything entered in the app — output, leave, overtime, inventory, roster edits and manual attendance marks — is removed. Holidays, tasks, users and settings are kept. You can switch to in-app entry again later with START FRESH.
                  </p>
                  <BackToSheetsSwitch />
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Productivity targets"
            subtitle={admin ? "Kept in the app. Enter a number or a range; the upper end counts as 100% of target." : "Kept in the app; the upper end of each range counts as 100% of target. Only admins can change them."}
          />
          <CardBody>
            <ProcessTargetsForm
              editable={admin}
              rows={PROCESSES.filter((p) => p.inProductivity).map((p) => ({ column: p.column, label: p.label, family: p.family, range: pt.targets[p.column] ?? "" }))}
            />
            <p className="mt-3 text-[12px] text-muted">
              {pt.updatedBy ? `Last changed by ${pt.updatedBy} on ${pt.updatedAt?.slice(0, 10)}.` : "Targets agreed on 26 Nov 2026."} Excluded from productivity (counted as output only): {[...ds.processes.values()].filter((p) => !p.inProductivity).map((p) => p.label).join(", ")}.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Users & roles" subtitle={`Sign-in is limited to verified @${ALLOWED_DOMAIN} Google accounts`} />
          <CardBody>
            <dl className="mb-4 grid gap-2 text-[12.5px] text-ink-2 sm:grid-cols-2">
              <div><dt className="font-medium text-ink">Viewer</dt><dd>Read every dashboard, export reports; log own output, leave and overtime</dd></div>
              <div><dt className="font-medium text-ink">Lead</dt><dd>+ tasks, alerts; approve and enter for their team, inventory, attendance marks</dd></div>
              <div><dt className="font-medium text-ink">Manager</dt><dd>+ delete tasks, manual sync, approve for everyone, roster</dd></div>
              <div><dt className="font-medium text-ink">Admin</dt><dd>+ settings, roles, holidays, targets, go-live</dd></div>
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
