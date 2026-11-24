"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Any server or rendering error on a page shows this instead of a blank screen.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto mt-10 max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-card">
      <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
        <AlertTriangle size={18} className="text-critical" aria-hidden /> This page could not be loaded
      </p>
      <p className="mt-2 text-[13.5px] text-ink-2">
        Something went wrong while reading the data. Try again; if it keeps happening, check <a className="font-medium text-accent hover:underline" href="/data-sources">Data Sources</a> or the server logs.
      </p>
      {error.digest && (
        <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink-2">
          Error reference: {error.digest}
          <span className="block font-sans text-muted">Search the Vercel runtime logs for this reference to see the details.</span>
        </p>
      )}
      <button type="button" onClick={reset} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-ink hover:opacity-90">
        <RefreshCw size={15} aria-hidden /> Try again
      </button>
    </div>
  );
}
