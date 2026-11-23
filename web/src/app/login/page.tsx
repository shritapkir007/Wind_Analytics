import { redirect } from "next/navigation";
import { Wind } from "lucide-react";
import { auth, signIn } from "@/auth";
import { devBypass } from "@/auth.config";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const sp = await searchParams;
  if (devBypass || (await auth())?.user) redirect(sp.callbackUrl ?? "/overview");
  const domain = process.env.ALLOWED_EMAIL_DOMAIN ?? "zeitview.com";
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-card">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--s1)] text-white">
          <Wind size={20} aria-hidden />
        </span>
        <h1 className="mt-4 text-[20px] font-semibold text-ink">Wind Ops</h1>
        <p className="mt-1 text-[13.5px] text-ink-2">Team operations &amp; performance. Sign in with your @{domain} Google account.</p>
        {sp.error && (
          <p className="mt-4 rounded-lg bg-critical-soft px-3 py-2 text-[13px] text-critical" role="alert">
            {sp.error === "AccessDenied" ? `Only verified @${domain} accounts can sign in.` : "Sign-in failed. Please try again."}
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: sp.callbackUrl ?? "/overview" });
          }}
        >
          <button type="submit" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-medium text-accent-ink hover:opacity-90">
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
