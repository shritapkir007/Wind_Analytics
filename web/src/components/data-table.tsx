"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

export type Cell = string | number | null | { v: string | number | null; label?: string; href?: string; tone?: "good" | "warning" | "critical" | "muted"; badge?: boolean };

export interface Col {
  key: string;
  header: string;
  align?: "left" | "right";
  width?: number;
  hideOnMobile?: boolean;
}

const val = (c: Cell) => (c != null && typeof c === "object" ? c.v : c);
const TONE: Record<string, string> = {
  good: "text-good",
  warning: "text-ink",
  critical: "text-critical",
  muted: "text-muted",
};
const BADGE: Record<string, string> = {
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-ink",
  critical: "bg-critical-soft text-critical",
  muted: "bg-surface-2 text-ink-2",
};

function render(c: Cell): ReactNode {
  if (c == null) return <span className="text-muted">—</span>;
  if (typeof c !== "object") return typeof c === "number" ? c.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : c;
  const text = c.label ?? (c.v == null ? "—" : typeof c.v === "number" ? c.v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : c.v);
  const inner = c.badge ? (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ${BADGE[c.tone ?? "muted"]}`}>{text}</span>
  ) : (
    <span className={c.tone ? TONE[c.tone] : undefined}>{text}</span>
  );
  return c.href ? (
    <Link href={c.href} className="font-medium text-ink hover:text-accent hover:underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function toCsv(cols: Col[], rows: Record<string, Cell>[]) {
  const esc = (s: unknown) => {
    const t = s == null ? "" : String(s);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.map((c) => esc(c.header)).join(","), ...rows.map((r) => cols.map((c) => esc(val(r[c.key]))).join(","))].join("\n");
}

export function DataTable({
  columns,
  rows,
  pageSize = 15,
  searchable = true,
  filename = "export",
  initialSort,
  emptyText = "No records for the selected filters.",
  dense = false,
}: {
  columns: Col[];
  rows: Record<string, Cell>[];
  pageSize?: number;
  searchable?: boolean;
  filename?: string;
  initialSort?: { key: string; desc?: boolean };
  emptyText?: string;
  dense?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [{ id: initialSort.key, desc: Boolean(initialSort.desc) }] : []);
  const [q, setQ] = useState("");
  const defs = useMemo<ColumnDef<Record<string, Cell>>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        accessorFn: (r) => val(r[c.key]) ?? "",
        header: c.header,
        cell: (info) => render(info.row.original[c.key]),
        sortingFn: (a, b, id) => {
          const x = val(a.original[id]);
          const y = val(b.original[id]);
          if (x == null || x === "") return y == null || y === "" ? 0 : 1;
          if (y == null || y === "") return -1;
          return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        },
      })),
    [columns],
  );
  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting, globalFilter: q },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQ,
    globalFilterFn: (row, _id, f: string) => {
      const s = f.toLowerCase();
      return columns.some((c) => {
        const cell = row.original[c.key];
        const t = cell != null && typeof cell === "object" ? `${cell.label ?? ""} ${cell.v ?? ""}` : String(cell ?? "");
        return t.toLowerCase().includes(s);
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const filtered = table.getFilteredRowModel().rows;
  const download = () => {
    const blob = new Blob([toCsv(columns, filtered.map((r) => r.original))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const pad = dense ? "py-1.5" : "py-2.5";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {searchable ? (
          <label className="relative block w-full max-w-xs">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden />
            <span className="sr-only">Search table</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 w-full rounded-lg border border-line-strong bg-surface pr-2 pl-8 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
          </label>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3 text-[12px] text-muted">
          <span className="tnum">{filtered.length.toLocaleString("en-IN")} rows</span>
          <button type="button" onClick={download} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
            <Download size={13} aria-hidden /> CSV
          </button>
        </div>
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const col = columns.find((c) => c.key === h.id)!;
                  const dir = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col" style={{ width: col.width }} className={`border-b border-line bg-surface-2 px-3 py-2 text-[12px] font-medium whitespace-nowrap text-ink-2 ${col.align === "right" ? "text-right" : ""} ${col.hideOnMobile ? "hidden md:table-cell" : ""}`}>
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className={`inline-flex items-center gap-1 hover:text-ink ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {dir === "asc" ? <ArrowUp size={12} /> : dir === "desc" ? <ArrowDown size={12} /> : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/60">
                {r.getVisibleCells().map((c) => {
                  const col = columns.find((x) => x.key === c.column.id)!;
                  return (
                    <td key={c.id} className={`border-b border-line px-3 ${pad} align-middle text-ink ${col.align === "right" ? "tnum text-right" : ""} ${col.hideOnMobile ? "hidden md:table-cell" : ""}`}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-[13px] text-muted">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-[12px] text-ink-2">
          <span className="tnum">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <button type="button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} className="h-7 rounded-md border border-line-strong px-2 disabled:opacity-40">
            Previous
          </button>
          <button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} className="h-7 rounded-md border border-line-strong px-2 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
