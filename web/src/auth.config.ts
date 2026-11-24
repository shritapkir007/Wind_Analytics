// Edge-safe Auth.js config (used by middleware). Database lookups live in src/auth.ts.
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "zeitview.com").toLowerCase();

export const devBypass = process.env.AUTH_DEV_BYPASS === "1" && process.env.NODE_ENV !== "production";

export default {
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [
    Google({
      // Pre-selects the Workspace domain; the domain is still verified server-side below.
      authorization: { params: { hd: domain, prompt: "select_account" } },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = String(profile?.email ?? "").toLowerCase();
      const verified = profile?.email_verified === true;
      const hd = String((profile as { hd?: string } | undefined)?.hd ?? "").toLowerCase();
      return verified && email.endsWith(`@${domain}`) && hd === domain;
    },
    authorized({ auth, request }) {
      if (devBypass) return true;
      const p = request.nextUrl.pathname;
      if (p.startsWith("/login") || p.startsWith("/api/auth") || p.startsWith("/api/sync") || p.startsWith("/api/health")) return true;
      return Boolean(auth?.user?.email);
    },
  },
} satisfies NextAuthConfig;
