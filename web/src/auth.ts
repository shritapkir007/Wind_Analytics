import NextAuth from "next-auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import authConfig, { devBypass } from "./auth.config";
import { getDb, schema } from "./lib/db";
import { nowIso } from "./lib/config";

export type Role = "viewer" | "lead" | "manager" | "admin";
const RANK: Record<Role, number> = { viewer: 0, lead: 1, manager: 2, admin: 3 };

const admins = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const defaultRole = (): Role => ((process.env.DEFAULT_ROLE as Role) in RANK ? (process.env.DEFAULT_ROLE as Role) : "viewer");

async function roleFor(email: string, name?: string | null): Promise<Role> {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  let role: Role = (u?.role as Role) ?? defaultRole();
  if (admins().includes(email)) role = "admin";
  await db
    .insert(schema.users)
    .values({ email, name: name ?? null, role, lastLogin: nowIso() })
    .onConflictDoUpdate({ target: schema.users.email, set: { lastLogin: nowIso(), name: name ?? null, role } });
  return role;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user?.email || trigger === "update" || !token.role || Date.now() / 1000 - Number(token.roleAt ?? 0) > 600) {
        const email = String(user?.email ?? token.email ?? "").toLowerCase();
        if (email) {
          try {
            token.role = await roleFor(email, user?.name ?? token.name);
            token.roleAt = Math.floor(Date.now() / 1000);
          } catch (e) {
            // The database is unreachable or busy: don't fail the sign-in (Auth.js would only say
            // "Sign-in failed"). Keep the role we had, or the safe default, and retry in a minute;
            // pages then show the actual database error.
            console.error("role lookup failed during sign-in", e);
            token.role = (token.role as Role | undefined) ?? (admins().includes(email) ? "admin" : defaultRole());
            token.roleAt = Math.floor(Date.now() / 1000) - 540;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as { role?: Role }).role = (token.role as Role) ?? "viewer";
      return session;
    },
  },
});

export interface CurrentUser {
  email: string;
  name: string;
  role: Role;
}

export async function currentUser(): Promise<CurrentUser> {
  if (devBypass) return { email: process.env.DEV_USER_EMAIL ?? "dev@localhost", name: "Developer", role: "admin" };
  const s = await auth();
  if (!s?.user?.email) redirect("/login");
  return { email: s.user.email, name: s.user.name ?? s.user.email, role: ((s.user as { role?: Role }).role ?? "viewer") as Role };
}

export function can(user: CurrentUser, min: Role) {
  return RANK[user.role] >= RANK[min];
}

export async function requireRole(min: Role): Promise<CurrentUser> {
  const u = await currentUser();
  if (!can(u, min)) throw new Error(`This action needs the ${min} role (you are ${u.role}).`);
  return u;
}
