import Link from "next/link";
import { can, currentUser } from "@/auth";
import { todayIST } from "@/lib/config";
import { getDataset } from "@/lib/domain/dataset";
import { addDays, fmtDate } from "@/lib/domain/dates";
import { countsForEntry, prioritySites } from "@/lib/domain/pipeline";
import { STREAMS } from "@/lib/entry/catalog";
import { requireAppModePage } from "@/lib/entry/page-guard";
import { PRIORITY_STATUSES, TRACKERS, isDone } from "@/lib/pipeline";
import { fmtNum, type SP } from "@/lib/view";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, td, th } from "@/components/ui";
import { DeletePrioritySite, InventoryForm, PipelineForm, PrioritySiteForm, type InventoryRow } from "@/components/entry/forms";

export const dynamic = "force-dynamic";

export default async function Inventory({ searchParams }: { searchParams: Promise<SP> }) {
  const guard = await requireAppModePage("Inventory");
  if (guard) return guard;
  if (!can(await currentUser(), "lead")) return <div className="fade-in"><PageHeader title="Inventory" subtitle="Only team leads, managers and admins record inventory." /></div>;
  const sp = await searchParams;
  const today = todayIST();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const [ds, entry, sites] = await Promise.all([getDataset(), countsForEntry(date), prioritySites()]);
  const editing = typeof sp.site === "string" ? sites.find((s) => s.id === sp.site) : undefined;

  const rows: InventoryRow[] = ds.delivery
    .filter((d) => d.date === date)
    .map((d) => ({ stream: d.stream, expected: d.expected, uploaded: d.uploaded, inventory: d.inventory, qualityIssues: d.qualityIssues, duplicates: d.duplicates, lateUploads: d.lateUploads, auditCount: d.auditCount, delivered: d.delivered, deliveredManual: Boolean((d as { deliveredManual?: boolean }).deliveredManual) }));
  const from = addDays(today, -20);
  const history = ds.delivery.filter((d) => d.date >= from).sort((a, b) => b.date.localeCompare(a.date) || STREAMS.indexOf(a.stream) - STREAMS.indexOf(b.stream));

  return (
    <div className="fade-in">
      <PageHeader title="Inventory" subtitle="Daily pipeline counts per Asana tracker, priority sites and delivery counts per stream. Everything here feeds the Dashboard." />
      <div className="grid gap-4">
        <Card id="pipeline">
          <CardHeader title={`Pipeline counts · ${fmtDate(date, true)}`} subtitle="WTGs in each section of each tracker (replaces the Wind-Inventory Count sheet)" />
          <CardBody>
            <PipelineForm
              key={date}
              date={date}
              today={today}
              trackers={TRACKERS.map((t) => ({
                id: t.id,
                label: t.label,
                unit: t.unit,
                from: entry[t.id].from,
                stages: t.stages.map((s) => ({ id: s.id, label: s.label, value: entry[t.id].counts[s.id] ?? null })),
              }))}
            />
          </CardBody>
        </Card>

        <Card id="priority">
          <CardHeader
            title={editing ? `Edit priority site · ${editing.site}` : "Priority sites"}
            subtitle="Sites the Ops coordinators asked to fast-track. Open sites show on the Dashboard."
            actions={editing ? <Link href="/inventory#priority" className="text-[13px] text-accent hover:underline">+ Add a new site instead</Link> : null}
          />
          <CardBody>
            <PrioritySiteForm key={editing?.id ?? "new"} statuses={PRIORITY_STATUSES} value={editing ? { ...editing } : undefined} />
          </CardBody>
          <Table>
            <thead>
              <tr>{["Site", "Customer", "WTGs", "Prescreen", "Analysis", "FQC", "Requested by", "SLA", "ETD", "Status", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} className={isDone(s.status) ? "opacity-60" : undefined}>
                  <td className={`${td} font-medium`}>{s.site}{s.comments && <span className="block text-[11.5px] font-normal text-ink-2">{s.comments}</span>}</td>
                  <td className={td}>{s.customer}</td>
                  <td className={`${td} tnum`}>{s.wtgs ?? "—"}</td>
                  <td className={td}>{s.prescreen || "—"}</td>
                  <td className={td}>{s.analysis || "—"}</td>
                  <td className={td}>{s.fqc || "—"}</td>
                  <td className={td}>{s.requestedBy}</td>
                  <td className={td}>{s.sla || "—"}</td>
                  <td className={`${td} whitespace-nowrap`}>{s.etd ? fmtDate(s.etd, true) : "—"}</td>
                  <td className={td}><Badge tone={isDone(s.status) ? "good" : /hold/i.test(s.status) ? "warning" : "neutral"}>{s.status || "—"}</Badge></td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={`/inventory?site=${encodeURIComponent(s.id)}#priority`} className="mr-1 text-[13px] text-accent hover:underline">Edit</Link>
                    <DeletePrioritySite id={s.id} site={s.site} />
                  </td>
                </tr>
              ))}
              {sites.length === 0 && <tr><td className={td} colSpan={11}>No priority sites yet.</td></tr>}
            </tbody>
          </Table>
        </Card>

        <Card id="streams">
          <CardHeader title={`Delivery counts per stream · ${fmtDate(date, true)}`} subtitle="External = Ext FQC · Internal = Int FQC · ZDT = ZDT FQC + ZDT Pitch Bearing FQC + ZDT QI Resolved (delivered is calculated unless typed)" />
          <CardBody>
            <InventoryForm key={date} date={date} today={today} rows={rows} />
          </CardBody>
          <Table>
            <thead>
              <tr>{["Date", "Stream", "Delivered", "Uploaded", "Inventory", "Quality issues", "Duplicates", "Late uploads", "Audit"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={`${d.stream}|${d.date}`}>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(d.date, true)}</td>
                  <td className={td}>{d.stream}</td>
                  <td className={`${td} tnum`}>{fmtNum(d.delivered, 2)}{(d as { deliveredManual?: boolean }).deliveredManual ? " (typed)" : ""}</td>
                  <td className={`${td} tnum`}>{fmtNum(d.uploaded)}</td>
                  <td className={`${td} tnum`}>{fmtNum(d.inventory)}</td>
                  <td className={`${td} tnum`}>{fmtNum(d.qualityIssues)}</td>
                  <td className={`${td} tnum`}>{fmtNum(d.duplicates)}</td>
                  <td className={`${td} tnum`}>{fmtNum(d.lateUploads)}</td>
                  <td className={`${td} tnum`}>{fmtNum(d.auditCount)}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td className={td} colSpan={9}>No counts recorded in the last 3 weeks.</td></tr>}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
