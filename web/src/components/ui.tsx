import Link from "next/link";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import type { ReactNode } from "react";

export function cn(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("min-w-0 rounded-2xl border border-line bg-surface shadow-card", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, actions, info }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; info?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

/** Accessible explanation popover (formula / source) without client JS. */
export function InfoTip({ children, label = "How this is calculated", align = "left" }: { children: ReactNode; label?: string; align?: "left" | "right" }) {
  return (
    <details className="group relative inline-block align-middle">
      <summary aria-label={label} className="flex cursor-pointer list-none items-center text-muted hover:text-ink-2 [&::-webkit-details-marker]:hidden">
        <Info size={14} aria-hidden />
      </summary>
      <div className={cn("absolute top-6 z-30 hidden w-72 max-w-[calc(100vw-2.5rem)] rounded-xl border border-line-strong bg-surface p-3 text-[12.5px] font-normal leading-relaxed text-ink-2 shadow-lg group-open:block", align === "right" ? "right-0" : "left-0")}>
        {children}
      </div>
    </details>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "good" | "warning" | "critical" | "accent" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-ink",
  critical: "bg-critical-soft text-critical",
  accent: "bg-accent-soft text-accent",
  info: "bg-surface-2 text-ink-2",
};
const DOTS: Record<Tone, string> = {
  neutral: "bg-muted",
  good: "bg-[var(--good-mark)]",
  warning: "bg-warning",
  critical: "bg-critical",
  accent: "bg-accent",
  info: "bg-muted",
};

export function Badge({ children, tone = "neutral", dot = true, className }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium", TONES[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function Delta({ pct, abs, upIsGood = true, suffix = "", label }: { pct: number | null; abs: number | null; upIsGood?: boolean; suffix?: string; label: string }) {
  if (abs == null) return <span className="text-[12px] text-muted">No comparison data</span>;
  const dir = Math.abs(abs) < 1e-9 ? 0 : abs > 0 ? 1 : -1;
  const good = dir === 0 ? null : (dir > 0) === upIsGood;
  const Icon = dir === 0 ? Minus : dir > 0 ? ArrowUpRight : ArrowDownRight;
  const v = pct != null ? `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%` : `${abs > 0 ? "+" : ""}${Math.round(abs * 10) / 10}${suffix}`;
  return (
    <span className="inline-flex items-center gap-1 text-[12px]">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", good === null ? "text-ink-2" : good ? "text-good" : "text-critical")}>
        <Icon size={13} aria-hidden />
        {v}
      </span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

export interface KpiProps {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  delta?: { pct: number | null; abs: number | null; upIsGood?: boolean; label: string; suffix?: string };
  href?: string;
  formula?: ReactNode;
  tone?: "default" | "warning" | "critical" | "good";
}

export function KpiCard({ label, value, unit, sub, delta, href, formula, tone = "default" }: KpiProps) {
  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col justify-between gap-2 rounded-2xl border bg-surface p-4 shadow-card transition",
        href && "hover:-translate-y-px hover:border-line-strong hover:shadow-md",
        tone === "critical" ? "border-[color-mix(in_srgb,var(--critical)_35%,transparent)]" : tone === "warning" ? "border-[color-mix(in_srgb,var(--warning)_45%,transparent)]" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
        {tone === "critical" && <Badge tone="critical">Attention</Badge>}
        {tone === "warning" && <Badge tone="warning">Watch</Badge>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</span>
        {unit && <span className="text-[13px] text-muted">{unit}</span>}
      </div>
      <div className="flex min-h-[18px] flex-col gap-0.5">
        {delta && <Delta {...delta} />}
        {sub && <span className="text-[12px] text-muted">{sub}</span>}
      </div>
    </div>
  );
  return (
    <div className="relative">
      {href ? (
        <Link href={href} className="block h-full rounded-2xl" aria-label={`${label}: ${value}${unit ? ` ${unit}` : ""}. Open details`}>
          {body}
        </Link>
      ) : (
        body
      )}
      {formula && (
        <div className="absolute right-3 bottom-3">
          <InfoTip align="right">{formula}</InfoTip>
        </div>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {children && <p className="max-w-md text-[13px] text-ink-2">{children}</p>}
    </div>
  );
}

export function Meter({ pct, tone }: { pct: number | null; tone?: "auto" | "accent" }) {
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const color = tone === "accent" || pct == null ? "var(--accent)" : pct >= 90 ? "var(--good-mark)" : pct >= 70 ? "var(--warning)" : "var(--critical)";
  return (
    <span className="relative inline-block h-1.5 w-20 overflow-hidden rounded-full bg-surface-3 align-middle" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${v}%`, background: color }} />
    </span>
  );
}

export function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />;
}

export function ButtonLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition",
        variant === "primary" ? "bg-accent text-accent-ink hover:opacity-90" : "border border-line-strong bg-surface text-ink hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

export const btn = {
  primary: "inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-ink transition hover:opacity-90 disabled:opacity-50",
  secondary: "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition hover:bg-surface-2 disabled:opacity-50",
  ghost: "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 transition hover:bg-surface-2",
};

export const input =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}
export const th = "sticky top-0 z-[1] border-b border-line bg-surface px-3 py-2 text-[12px] font-medium whitespace-nowrap text-ink-2";
export const td = "border-b border-line px-3 py-2 align-middle text-ink";
