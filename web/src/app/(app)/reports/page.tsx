import Link from "next/link";
import { Download, FileSpreadsheet, FileText, Lightbulb, Printer } from "lucide-react";
import { loadPage } from "@/lib/page";
import { FilterBar } from "@/components/filter-bar";
import { Card, CardBody, CardHeader, PageHeader, btn } from "@/components/ui";
import { buildReport, reportRange, type ReportKind } from "@/lib/domain/reports";
import { previousWorkingDay } from "@/lib/domain/metrics";
import { qs, type SP } from "@/lib/view";

export const dynamic = "force-dynamic";

const KINDS: [ReportKind, string, string][] = [
  ["daily", "Daily", "Attendance, leave, employee output, deliveries, tasks and issues for one day"],
  ["weekly", "Weekly", "Productivity, performance, attendance trend, target achievement and pending workload for a Mon–Sun week"],
  ["monthly", "Monthly", "Ranking, output trends, attendance & leave by team, quality and task completion for a month"],
  ["custom", "Custom range", "Any date range from the filter bar"],
];

export default async function Reports({ searchParams }: { searchParams: Promise<SP> }) {
  const { ds, sp, v, barProps } = await loadPage(searchParams);
  const kind = ((Array.isArray(sp.kind) ? sp.kind[0] : sp.kind) as ReportKind) ?? "daily";
  const k: ReportKind = KINDS.some(([x]) => x === kind) ? kind : "daily";
  const dateParam = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const anchor = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : k === "daily" && !sp.preset ? previousWorkingDay(ds, ds.today) : v.to;
  const range = reportRange(k, anchor, { from: v.from, to: v.to });
  const report = buildReport(ds, k, range, { section: v.section, employee: v.employee });
  const exportQs = qs(sp, { kind: k, date: anchor });

  return (
    <div className="fade-in">
      <PageHeader
        title="Reports & analytics"
        subtitle="Generated live from the synced data. Exports contain exactly what is shown here."
        actions={
          <>
            <a className={btn.secondary} href={`/api/export${qs({ ...sp }, { kind: k, date: anchor, format: "xlsx" })}`}>
              <FileSpreadsheet size={15} aria-hidden /> Excel
            </a>
            <a className={btn.secondary} href={`/api/export${qs({ ...sp }, { kind: k, date: anchor, format: "csv" })}`}>
              <Download size={15} aria-hidden /> CSV
            </a>
            <a className={btn.primary} href={`/api/export${qs({ ...sp }, { kind: k, date: anchor, format: "pdf" })}`}>
              <FileText size={15} aria-hidden /> PDF
            </a>
          </>
        }
      />
      <nav className="no-print mb-4 grid gap-2 md:grid-cols-4" aria-label="Report type">
        {KINDS.map(([key, label, desc]) => (
          <Link key={key} href={`/reports${qs(sp, { kind: key, date: null })}`} aria-current={k === key ? "page" : undefined} className={`rounded-2xl border p-3.5 transition ${k === key ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"}`}>
            <span className={`block text-[14px] font-semibold ${k === key ? "text-accent" : "text-ink"}`}>{label}</span>
            <span className="mt-0.5 block text-[12px] text-ink-2">{desc}</span>
          </Link>
        ))}
      </nav>
      <FilterBar {...barProps} />
      {k !== "custom" && (
        <form className="no-print mb-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-2" action="/reports">
          {Object.entries(sp).map(([key, val]) => (key !== "date" && typeof val === "string" ? <input key={key} type="hidden" name={key} value={val} /> : null))}
          <input type="hidden" name="kind" value={k} />
          <label htmlFor="r-date">{k === "daily" ? "Report date" : k === "weekly" ? "Any day in the week" : "Any day in the month"}</label>
          <input id="r-date" type="date" name="date" defaultValue={anchor} max={ds.today} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-ink" />
          <button className={btn.secondary} type="submit">
            Show
          </button>
        </form>
      )}

      <article className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <h2 className="text-[19px] font-semibold text-ink">{report.title}</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              Scope: {report.scope} · data up to the last sync · generated {new Date(report.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
            </p>
          </div>
          <span className="no-print inline-flex items-center gap-1 text-[12px] text-muted">
            <Printer size={13} aria-hidden /> Ctrl/⌘+P prints this view
          </span>
        </header>

        <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {report.kpis.map((kp) => (
            <div key={kp.label} className="rounded-xl bg-surface-2 p-3">
              <dt className="text-[12px] text-ink-2">{kp.label}</dt>
              <dd className="mt-1 text-[20px] font-semibold text-ink">{kp.value}</dd>
              {kp.note && <dd className="text-[11.5px] text-muted">{kp.note}</dd>}
            </div>
          ))}
        </dl>

        <section className="mb-6 rounded-xl border border-line p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            <Lightbulb size={15} aria-hidden /> Key findings & improvement opportunities
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
            {report.insights.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>

        {report.tables.map((t) => (
          <Card key={t.title} className="mb-4 shadow-none">
            <CardHeader title={t.title} subtitle={t.note} />
            <CardBody>
              {t.rows.length === 0 ? (
                <p className="text-[13px] text-muted">Nothing to report.</p>
              ) : (
                <div className="max-h-[440px] overflow-auto rounded-xl border border-line">
                  <table className="w-full text-[12.5px]">
                    <thead className="sticky top-0 bg-surface-2">
                      <tr>
                        {t.columns.map((c) => (
                          <th key={c} scope="col" className="px-3 py-2 text-left font-medium whitespace-nowrap text-ink-2">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((row, i) => (
                        <tr key={i} className="border-t border-line">
                          {row.map((c, j) => (
                            <td key={j} className={`px-3 py-1.5 ${typeof c === "number" ? "tnum text-right" : ""}`}>
                              {c == null ? "—" : String(c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </article>
      <p className="mt-3 text-[12px] text-muted">Export link: {`/api/export${exportQs}`}</p>
    </div>
  );
}
