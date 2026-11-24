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
    // Cloud databases get an encrypted connection unless the URL already sets sslmode.
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        throw new Error("DATABASE_URL is not a valid URL. Check for spaces, a leftover [YOUR-PASSWORD], or special characters in the password.");
      }
    })();
    const local = ["localhost", "127.0.0.1", "::1"].includes(host);
    const client = postgres(url, {
      prepare: false,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      connect_timeout: 15,
      ...(local || /[?&]sslmode=/.test(url) ? {} : { ssl: "require" as const }),
    });
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
  if (dir !== ":memory:") (await import("node:fs")).mkdirSync(dir, { recursive: true });
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

/**
 * Human-readable cause of a database error (drizzle wraps the driver error, which holds the
 * useful part, e.g. "password authentication failed"). Never includes the connection string.
 */
export function describeDbError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && i < 4; i++) {
    const err = cur as { message?: string; code?: string; cause?: unknown };
    if (err.message) parts.push(err.code ? `${err.message} (${err.code})` : err.message);
    cur = err.cause;
  }
  const url = process.env.DATABASE_URL;
  let text = parts.filter((p, i) => parts.indexOf(p) === i).join(" ← ");
  if (url) {
    text = text.split(url).join("[DATABASE_URL]");
    try {
      const pw = decodeURIComponent(new URL(url).password);
      if (pw.length >= 4) text = text.split(pw).join("[password]");
    } catch {}
  }
  return text.replace(/postgres(ql)?:\/\/[^\s"]+/g, "[connection string]");
}
