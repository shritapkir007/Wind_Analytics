import "server-only";
import { and, eq, getTableColumns, or, sql, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { DB } from "../db";
import { hashOf } from "../sheets/normalize";

export interface DiffStats {
  read: number;
  inserted: number;
  updated: number;
  deleted: number;
}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Make `table` contain exactly `rows`: insert new keys, update rows whose content hash changed,
 * delete keys that disappeared from the source. Runs inside the caller's transaction.
 */
export async function applyDiff(
  tx: Tx | DB,
  table: PgTable,
  keyProps: string[],
  rows: Record<string, unknown>[],
): Promise<DiffStats> {
  const cols = getTableColumns(table) as Record<string, PgColumn>;
  const keyCols = keyProps.map((k) => cols[k]);
  const keyOf = (r: Record<string, unknown>) => keyProps.map((k) => String(r[k])).join("\u0001");

  const selection: Record<string, PgColumn> = { hash: cols.hash };
  for (const k of keyProps) selection[k] = cols[k];
  const existing = new Map<string, string>();
  const existingRows = (await tx.select(selection).from(table)) as Record<string, unknown>[];
  for (const r of existingRows) existing.set(keyOf(r), String(r.hash));

  const incoming = new Map<string, Record<string, unknown>>();
  for (const r of rows) incoming.set(keyOf(r), { ...r, hash: hashOf(r) });

  const changed: Record<string, unknown>[] = [];
  let inserted = 0;
  let updated = 0;
  for (const [k, r] of incoming) {
    const h = existing.get(k);
    if (h === undefined) inserted++;
    else if (h !== r.hash) updated++;
    else continue;
    changed.push(r);
  }

  const set: Record<string, SQL> = {};
  for (const [prop, col] of Object.entries(cols)) {
    if (!keyProps.includes(prop)) set[prop] = sql.raw(`excluded."${col.name}"`);
  }
  const perRow = Math.max(1, Object.keys(cols).length);
  const chunk = Math.max(50, Math.floor(30000 / perRow));
  for (let i = 0; i < changed.length; i += chunk) {
    await tx
      .insert(table)
      .values(changed.slice(i, i + chunk) as never)
      .onConflictDoUpdate({ target: keyCols, set });
  }

  const gone = existingRows.filter((r) => !incoming.has(keyOf(r)));
  for (let i = 0; i < gone.length; i += 200) {
    const conds = gone.slice(i, i + 200).map((r) => and(...keyProps.map((k) => eq(cols[k], r[k] as never)))!);
    await tx.delete(table).where(or(...conds));
  }
  return { read: rows.length, inserted, updated, deleted: gone.length };
}
