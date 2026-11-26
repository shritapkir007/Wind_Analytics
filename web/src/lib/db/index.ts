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
    // Prepared statements off: safe with every Supabase pooler mode (session 5432 recommended).
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
      // Serverless: every running instance holds its own pool, and Supabase's session pooler only
      // allows a few connections in total, so keep each instance small (override: DB_POOL_MAX).
      max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 2 : 5)),
      // One query per connection at a time. postgres.js otherwise pipelines up to 100 queries
      // on a busy connection, which Supabase's transaction pooler (Supavisor) can stall on.
      ...({ max_pipeline: 1 } as Record<string, number>), // supported at runtime, missing from the type definitions
      connect_timeout: 15,
      // Serverless: close idle connections quickly so a paused-then-resumed function never
      // reuses a socket the pooler has already dropped.
      idle_timeout: 20,
      max_lifetime: 60 * 10,
      onnotice: () => {},
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

export class DbTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`The database did not answer within ${Math.round(ms / 1000)} s (${what}). Check the Supabase project status and DATABASE_URL, then try again.`);
    this.name = "DbTimeoutError";
  }
}

/** Fail fast instead of letting a stuck query run into the platform's 300 s function limit. */
export async function withDbTimeout<T>(p: Promise<T>, what: string, ms = Number(process.env.DB_QUERY_TIMEOUT_MS ?? 25_000)): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DbTimeoutError(what, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Short, readable error for the UI and sync log: the driver's own reason (e.g. "duplicate key
 * value violates unique constraint …") instead of drizzle's "Failed query: <whole SQL>" wrapper.
 */
export function shortDbError(e: unknown, max = 400): string {
  const chain: { message?: string; code?: string; detail?: string }[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && i < 5; i++) {
    chain.push(cur as never);
    cur = (cur as { cause?: unknown }).cause;
  }
  const root = [...chain].reverse().find((x) => x.message && !/^Failed query:/.test(x.message)) ?? chain[0] ?? {};
  let text = `${root.message ?? String(e)}${root.detail ? ` — ${root.detail}` : ""}${root.code ? ` (${root.code})` : ""}`;
  text = describeDbError({ message: text });
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
