// Next.js calls onRequestError for every server error. Vercel's log line otherwise shows only
// drizzle's "Failed query: <SQL>" wrapper; this adds the underlying reason (e.g. "max clients
// reached", a timeout) next to the error reference shown on the page. Secrets are redacted.
// Self-contained on purpose: this file is also bundled for the edge runtime.

function reason(err: unknown): string {
  const chain: { message?: string; code?: string; detail?: string }[] = [];
  let cur: unknown = err;
  for (let i = 0; cur && i < 6; i++) {
    chain.push(cur as never);
    cur = (cur as { cause?: unknown }).cause;
  }
  const root = [...chain].reverse().find((x) => x?.message && !/^Failed query:/.test(x.message)) ?? chain[0] ?? {};
  let text = `${root.message ?? String(err)}${root.detail ? ` — ${root.detail}` : ""}${root.code ? ` (${root.code})` : ""}`;
  const url = process.env.DATABASE_URL;
  if (url) {
    text = text.split(url).join("[DATABASE_URL]");
    try {
      const pw = decodeURIComponent(new URL(url).password);
      if (pw.length >= 4) text = text.split(pw).join("[password]");
    } catch {}
  }
  text = text.replace(/postgres(ql)?:\/\/[^\s"]+/g, "[connection string]");
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  try {
    const digest = (err as { digest?: string }).digest ?? "-";
    console.error(`[error ref ${digest}] ${request.method} ${request.path}: ${reason(err)}`);
  } catch {
    // never let logging break the request
  }
}
