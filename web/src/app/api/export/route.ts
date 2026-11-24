import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { currentUser } from "@/auth";
import { getDataset } from "@/lib/domain/dataset";
import { buildReport, reportRange, type Report, type ReportKind } from "@/lib/domain/reports";
import { parseView } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const csvEsc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(r: Report) {
  const lines: string[] = [csvEsc(r.title), `Scope,${csvEsc(r.scope)}`, `Generated,${r.generatedAt}`, "", "KPI,Value,Note", ...r.kpis.map((k) => [k.label, k.value, k.note ?? ""].map(csvEsc).join(","))];
  for (const t of r.tables) {
    lines.push("", csvEsc(t.title), t.columns.map(csvEsc).join(","), ...t.rows.map((row) => row.map(csvEsc).join(",")));
    if (t.note) lines.push(csvEsc(`Note: ${t.note}`));
  }
  lines.push("", "Insights", ...r.insights.map(csvEsc));
  return "﻿" + lines.join("\n");
}

async function toXlsx(r: Report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wind Ops";
  wb.created = new Date();
  const sum = wb.addWorksheet("Summary");
  sum.addRow([r.title]).font = { bold: true, size: 14 };
  sum.addRow([`Scope: ${r.scope}`]);
  sum.addRow([`Generated: ${r.generatedAt}`]);
  sum.addRow([]);
  const h = sum.addRow(["KPI", "Value", "Note"]);
  h.font = { bold: true };
  for (const k of r.kpis) sum.addRow([k.label, k.value, k.note ?? ""]);
  sum.addRow([]);
  sum.addRow(["Insights"]).font = { bold: true };
  for (const i of r.insights) sum.addRow([i]);
  sum.columns = [{ width: 36 }, { width: 18 }, { width: 60 }];
  const used = new Set<string>();
  for (const t of r.tables) {
    let name = t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    const hr = ws.addRow(t.columns);
    hr.font = { bold: true };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEA" } };
    for (const row of t.rows) ws.addRow(row);
    if (t.note) {
      ws.addRow([]);
      ws.addRow([t.note]).font = { italic: true };
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.columns.forEach((c, i) => (c.width = Math.min(48, Math.max(10, t.columns[i].length + 2, ...t.rows.slice(0, 200).map((r2) => String(r2[i] ?? "").length + 2)))));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toPdf(r: Report) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  doc.text(r.title, 40, 44);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Scope: ${r.scope} · Generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`, 40, 60);
  doc.setTextColor(0);
  autoTable(doc, { startY: 74, head: [["KPI", "Value", "Note"]], body: r.kpis.map((k) => [k.label, k.value, k.note ?? ""]), styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [28, 92, 171] }, margin: { left: 40, right: 40 }, tableWidth: W / 2 });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  doc.setFontSize(11);
  doc.text("Insights", 40, y);
  doc.setFontSize(8.5);
  y += 14;
  for (const i of r.insights) {
    const lines = doc.splitTextToSize(`• ${i}`, W - 80);
    if (y + lines.length * 11 > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 40;
    }
    doc.text(lines, 40, y);
    y += lines.length * 11 + 2;
  }
  for (const t of r.tables) {
    doc.addPage();
    doc.setFontSize(12);
    doc.text(t.title, 40, 40);
    autoTable(doc, {
      startY: 52,
      head: [t.columns],
      body: t.rows.map((row) => row.map((c) => (c == null ? "—" : String(c)))),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [28, 92, 171] },
      margin: { left: 40, right: 40 },
    });
    if (t.note) {
      const fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(t.note, 40, fy);
      doc.setTextColor(0);
    }
  }
  return Buffer.from(doc.output("arraybuffer"));
}

export async function GET(req: NextRequest) {
  await currentUser();
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const ds = await getDataset();
  const kind = (["daily", "weekly", "monthly", "custom"].includes(sp.kind) ? sp.kind : "daily") as ReportKind;
  const v = parseView(sp, ds.today);
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : v.to;
  const range = reportRange(kind, anchor, { from: v.from, to: v.to });
  const report = buildReport(ds, kind, range, { section: v.section, employee: v.employee });
  const base = `wind-ops-${kind}-${range.from}_${range.to}`;
  const format = sp.format ?? "xlsx";
  if (format === "csv") return new NextResponse(toCsv(report), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"` } });
  if (format === "pdf") return new NextResponse(toPdf(report), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"` } });
  if (format === "json") return NextResponse.json(report);
  return new NextResponse(await toXlsx(report), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${base}.xlsx"` } });
}
