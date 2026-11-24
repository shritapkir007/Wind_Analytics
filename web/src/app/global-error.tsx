"use client";

// Last-resort boundary (errors in the app layout itself): never leave a blank page.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f6f6f4", color: "#0b0b0b", margin: 0 }}>
        <div role="alert" style={{ maxWidth: 560, margin: "15vh auto", padding: 24, background: "#fff", border: "1px solid #e1e0d9", borderRadius: 16 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Wind Ops could not load</h1>
          <p style={{ fontSize: 14, color: "#52514e" }}>The server hit an error before the page could be shown. Try again in a moment.</p>
          {error.digest && <p style={{ fontSize: 12, fontFamily: "monospace", color: "#52514e" }}>Error reference: {error.digest} (search the Vercel runtime logs for it)</p>}
          <button onClick={reset} style={{ marginTop: 8, padding: "8px 14px", borderRadius: 8, border: 0, background: "#1c5cab", color: "#fff", cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
