// Shown while a page's data loads (e.g. the first request after a deploy starts the server).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-2 h-7 w-64 rounded-lg bg-surface-3" />
      <div className="mb-6 h-4 w-96 max-w-full rounded bg-surface-2" />
      <div className="mb-5 h-14 rounded-2xl bg-surface-2" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface-2" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-72 rounded-2xl bg-surface-2 xl:col-span-2" />
        <div className="h-72 rounded-2xl bg-surface-2" />
      </div>
      <p className="mt-6 text-center text-[13px] text-muted">Loading data… the first visit after an update can take a few seconds.</p>
    </div>
  );
}
