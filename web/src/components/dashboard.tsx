// Building blocks of the one-page Dashboard. Server components unless marked otherwise.

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { TrackerView } from "@/lib/domain/pipeline";
import { fmtDate } from "@/lib/domain/dates";

export const GROUP_COLOR: Record<string, string> = {
  "External Blade": "var(--s1)",
  "Internal Blade": "var(--s2)",
  "Zero Down Time": "var(--s3)",
  Uploads: "var(--s7)",
};

const n = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 1 });

// ------------------------------------------------------------------ hero

/** Three turbines on a ridge; rotors turn slowly (stopped for prefers-reduced-motion). */
export function Turbines({ className = "" }: { className?: string }) {
  const turbine = (x: number, h: number, speed: string, scale: number) => (
    <g transform={`translate(${x} ${200 - h}) scale(${scale})`}>
      <path d={`M-3 0 L3 0 L1.6 ${h / scale} L-1.6 ${h / scale} Z`} fill="currentColor" opacity="0.9" />
      <g className="wind-rotor" style={{ animationDuration: speed }}>
        {[0, 120, 240].map((a) => (
          <path key={a} d="M0 0 C 4 -10, 5 -34, 1.5 -62 C -1 -40, -3 -14, 0 0 Z" fill="currentColor" transform={`rotate(${a})`} />
        ))}
        <circle r="4.2" fill="currentColor" />
        {/* invisible disc centred on the hub, so the rotor's box centre is the hub */}
        <circle r="63" fill="none" stroke="none" />
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 420 200" className={className} aria-hidden focusable="false">
      <path d="M0 200 C 90 168, 170 176, 250 160 S 380 150, 420 156 L420 200 Z" fill="currentColor" opacity="0.12" />
      {turbine(120, 120, "7s", 0.85)}
      {turbine(250, 150, "5.5s", 1)}
      {turbine(355, 105, "8s", 0.72)}
      {[30, 62, 94].map((y, i) => (
        <path key={y} className="wind-streak" style={{ animationDelay: `${i * 1.3}s` }} d={`M-40 ${y} q 60 -10 120 0 t 120 0`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
      ))}
    </svg>
  );
}

export function HeroStat({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="block truncate text-[11.5px] font-medium tracking-wide text-white/75 uppercase">{label}</span>
      <span className="tnum mt-1 block text-[26px] leading-none font-semibold text-white">{value}</span>
      {sub && <span className="mt-1.5 block truncate text-[12px] text-white/80">{sub}</span>}
    </>
  );
  const cls = "block min-w-0 rounded-xl border border-white/15 bg-white/10 px-3.5 py-3 backdrop-blur-sm transition";
  return href ? (
    <a href={href} className={`${cls} hover:bg-white/15`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ------------------------------------------------------------------ small marks

export function Change({ cur, prev, upIsBad = true, suffix = "" }: { cur: number; prev: number | null; upIsBad?: boolean; suffix?: string }) {
  if (prev == null) return <span className="text-[12px] text-muted">first count</span>;
  const d = cur - prev;
  if (d === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[12px] text-muted">
        <Minus size={12} aria-hidden /> no change
      </span>
    );
  const bad = upIsBad ? d > 0 : d < 0;
  return (
    <span className={`tnum inline-flex items-center gap-0.5 text-[12px] font-medium ${bad ? "text-serious" : "text-good"}`}>
      {d > 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
      {d > 0 ? "+" : ""}
      {n(d)}
      {suffix}
      <span className="sr-only">{bad ? " (worse)" : " (better)"}</span>
    </span>
  );
}

/** Area sparkline with a hover title per point. Single series: the card title names it. */
export function Sparkline({ points, color, label }: { points: { date: string; total: number }[]; color: string; label: string }) {
  if (points.length < 2) return <div className="h-12 rounded-md bg-surface-2" aria-hidden />;
  const W = 240;
  const H = 48;
  const max = Math.max(...points.map((p) => p.total), 1);
  const min = Math.min(...points.map((p) => p.total));
  const span = Math.max(max - min, max * 0.1, 1);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 8);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(" ");
  const step = W / (points.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-full overflow-visible" role="img" aria-label={`${label}: ${n(points[0].total)} on ${fmtDate(points[0].date)} to ${n(points.at(-1)!.total)} on ${fmtDate(points.at(-1)!.date)}`}>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points.at(-1)!.total)} r="3.5" fill={color} stroke="var(--surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <rect key={p.date} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" className="spark-hit">
          <title>{`${fmtDate(p.date, true)}: ${n(p.total)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ pipeline card

export function TrackerCard({ v, today }: { v: TrackerView; today: string }) {
  const color = GROUP_COLOR[v.tracker.group];
  const max = Math.max(...v.stages.map((s) => s.count), 1);
  const stale = v.asOf && v.asOf < today;
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 shadow-card">
      <header className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-muted uppercase">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
          {v.tracker.group}
        </p>
        <h3 className="mt-0.5 text-[14px] leading-snug font-semibold text-ink">{v.tracker.label}</h3>
      </header>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="leading-none">
          <span className="tnum text-[26px] font-semibold text-ink">{n(v.total)}</span>
          <span className="ml-1.5 text-[12px] text-muted">{v.tracker.unit}</span>
        </p>
        <span className="flex flex-col items-end gap-0.5">
          <Change cur={v.total} prev={v.prevTotal} />
          <span className={`text-[11.5px] ${stale ? "text-warning" : "text-muted"}`} title={v.updatedBy ? `Counted by ${v.updatedBy}` : undefined}>
            {v.asOf ? `${stale ? "last counted" : "counted"} ${fmtDate(v.asOf)}` : "not counted yet"}
          </span>
        </span>
      </div>
      <div className="mt-2">
        <Sparkline points={v.series} color={color} label={`${v.tracker.label} total`} />
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {v.stages.map((s) => (
          <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
            <span className="truncate text-[12.5px] text-ink-2">{s.label}</span>
            <span className="tnum text-right text-[12.5px] font-medium text-ink">
              {n(s.count)}
              {s.prev != null && s.count !== s.prev && <span className={`ml-1.5 text-[11px] font-normal ${s.count > s.prev ? "text-serious" : "text-good"}`}>{s.count > s.prev ? "+" : ""}{n(s.count - s.prev)}</span>}
            </span>
            <span className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(s.count > 0 ? 2 : 0, (s.count / max) * 100)}%`, background: color }} />
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {aside && <div className="text-[12px] text-muted">{aside}</div>}
    </div>
  );
}
