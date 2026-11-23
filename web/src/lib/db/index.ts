import "server-only";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as { __windDb?: Promise<DB> };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 5) });
    const db = drizzle(client, { schema });
    if (process.env.DB_AUTO_MIGRATE !== "0") await migrate(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMBEDDED_DB !== "1") {
    throw new Error("DATABASE_URL is not set. Configure the Postgres connection string (see web/README.md).");
  }
  // Local development: embedded Postgres (PGlite) stored on disk.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const client = new PGlite(dir === ":memory:" ? undefined : dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__windDb) g.__windDb = connect().catch((e) => {
    g.__windDb = undefined;
    throw e;
  });
  return g.__windDb;
}

export { schema };
