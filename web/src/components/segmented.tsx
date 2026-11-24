import { Swatch } from "./ui";

/** Tall segmented bar: one whole split into parts, with a legend (no donut charts). */
export function SegmentedBar({ parts, label, format = (n) => String(Math.round(n)) }: { parts: { name: string; value: number; color: string; href?: string }[]; label: string; format?: (n: number) => string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[6px]" role="img" aria-label={`${label}: ${visible.map((p) => `${p.name} ${format(p.value)}`).join(", ")}`}>
        {total === 0 && <div className="h-full w-full rounded-[4px] bg-surface-3" />}
        {visible.map((p) => {
          const share = (p.value / total) * 100;
          return (
            <div key={p.name} title={`${p.name}: ${format(p.value)} (${share.toFixed(0)}%)`} className="flex h-full items-center rounded-[4px] px-2 text-[11.5px] font-semibold" style={{ width: `${share}%`, background: p.color, color: p.color.includes("s4") || p.color.includes("warning") ? "#0b0b0b" : "#ffffff" }}>
              {share >= 9 && <span className="truncate">{share.toFixed(0)}%</span>}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.name} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <Swatch color={p.color} />
            {p.href ? (
              <a className="hover:text-ink hover:underline" href={p.href}>
                {p.name}
              </a>
            ) : (
              p.name
            )}
            <span className="tnum font-medium text-ink">{format(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
