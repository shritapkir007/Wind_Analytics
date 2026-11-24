import { signOut } from "@/auth";

export default function Logout() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4">
      <form
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-card"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <h1 className="text-[18px] font-semibold text-ink">Sign out of Wind Ops?</h1>
        <button type="submit" className="mt-5 h-10 w-full rounded-lg bg-accent text-[14px] font-medium text-accent-ink hover:opacity-90">
          Sign out
        </button>
      </form>
    </main>
  );
}
