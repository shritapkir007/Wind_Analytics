"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Re-renders the page from the server every `seconds` while the tab is visible. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<string>("");
  useEffect(() => {
    const stamp = () => setAt(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }));
    stamp();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      start(() => router.refresh());
      stamp();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[12px] text-white hover:bg-white/20"
      title={`Refreshes every ${seconds} s while this tab is open`}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
      </span>
      Live{at ? ` · ${at}` : ""}
      <RefreshCw size={12} className={pending ? "animate-spin" : ""} aria-hidden />
      <span className="sr-only">Refresh now</span>
    </button>
  );
}
