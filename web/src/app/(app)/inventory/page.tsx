import { can, currentUser } from "@/auth";
import { todayIST } from "@/lib/config";
import { getDataset } from "@/lib/domain/dataset";
import { addDays, fmtDate } from "@/lib/domain/dates";
import { STREAMS } from "@/lib/entry/catalog";
import { requireAppModePage } from "@/lib/entry/page-guard";
import { fmtNum, type SP } from "@/lib/view";
import { Card, CardBody, CardHeader, PageHeader, Table, td, th } from "@/components/ui";
import { InventoryForm, type InventoryRow } from "@/components/entry/forms";

export const dynamic = "force-dynamic";

export default async function Inventory({ searchParams }: { searchParams: Promise<SP> }) {
  const guard = await requireAppModePage("Inventory");
  if (guard) return guard;
  if (!can(await currentUser(), "lead")) return <div className="fade-in"><PageHeader title="Inventory" subtitle="Only team leads, managers and admins record inventory." /></div>;
  const sp = await searchParams;
  const today = todayIST();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const ds = await getDataset();
  const rows: InventoryRow[] = ds.delivery
    .filter((d) => d.date === date)
    .map((d) => ({ stream: d.stream, expected: d.expected, uploaded: d.uploaded, inventory: d.inventory, qualityIssues: d.qualityIssues, duplicates: d.duplicates, lateUploads: d.lateUploads, auditCount: d.auditCount, delivered: d.delivered, deliveredManual: Boolean((d as { deliveredManual?: boolean }).deliveredManual) }));
  const from = addDays(today, -20);
  const history = ds.delivery.filter((d) => d.date >= from).sort((a, b) => b.date.localeCompare(a.date) || STREAMS.indexOf(a.stream) - STREAMS.indexOf(b.stream));

  return (
    <div className="fade-in">
      <PageHeader title="Inventory" subtitle="Daily counts per stream. Delivered is calculated from the FQC output people log, unless you type a figure." />
      <div className="grid gap-4">
        <Card>
          <CardHeader title={`Counts for ${fmtDate(date, true)}`} subtitle="External = Ext FQC · Internal = Int FQC · ZDT = ZDT FQC + ZDT Pitch Bearing FQC + ZDT QI Resolved" />
          <CardBody>
            <InventoryForm key={date} date={date} today={today} rows={rows} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Last 3 weeks" />
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
              {history.length === 0 && <tr><td className={td} colSpan={9}>No counts recorded yet.</td></tr>}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
