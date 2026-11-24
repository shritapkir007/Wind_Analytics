"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CalendarCheck2,
  ChevronsLeft,
  ChevronsRight,
  Database,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  PackageCheck,
  Search,
  Settings,
  Sun,
  Users,
  Wind,
  X,
} from "lucide-react";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance & Leaves", icon: CalendarCheck2 },
  { href: "/output", label: "Output & Deliveries", icon: PackageCheck },
  { href: "/tasks", label: "Task Management", icon: ListChecks },
  { href: "/employees", label: "Employee Performance", icon: Users },
  { href: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { href: "/alerts", label: "Alerts & Notifications", icon: Bell },
  { href: "/data-sources", label: "Data Sources & Integrations", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

const KEEP = ["preset", "from", "to", "section", "employee"];

function NavLinks({ collapsed, alertCount, onNavigate }: { collapsed: boolean; alertCount: number; onNavigate?: () => void }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of KEEP) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const q = keep.toString();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={`${href}${q ? `?${q}` : ""}`}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition ${active ? "bg-sidebar-2 text-white" : "text-sidebar-ink hover:bg-sidebar-2/70 hover:text-white"}`}
          >
            {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-[var(--s1)]" aria-hidden />}
            <Icon size={18} className="shrink-0" aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
            {href === "/alerts" && alertCount > 0 && (
              <span className={`tnum ml-auto rounded-full bg-critical px-1.5 text-[11px] leading-5 font-semibold text-white ${collapsed ? "absolute top-1 right-1 px-1 text-[10px] leading-4" : ""}`}>{alertCount > 99 ? "99+" : alertCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-16 items-center gap-2.5 px-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--s1)] text-white">
        <Wind size={18} aria-hidden />
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[14px] font-semibold text-white">Wind Ops</span>
          <span className="block text-[11px] text-sidebar-ink">Team operations</span>
        </span>
      )}
    </div>
  );
}

export function Shell({
  children,
  user,
  sync,
  alertCount,
}: {
  children: ReactNode;
  user: { name: string; email: string; role: string };
  sync: { label: string; tone: "good" | "warning" | "critical"; title: string };
  alertCount: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("wind.sidebar") === "collapsed");
      const t = localStorage.getItem("wind.theme") as "light" | "dark" | null;
      if (t) {
        document.documentElement.dataset.theme = t;
        setTheme(t);
      }
    } catch {}
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("wind.sidebar", c ? "expanded" : "collapsed");
      } catch {}
      return !c;
    });
  };
  const toggleTheme = () => {
    const cur = theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("wind.theme", next);
    } catch {}
  };
  const dot = sync.tone === "good" ? "bg-[var(--good-mark)]" : sync.tone === "warning" ? "bg-warning" : "bg-critical";

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex ${collapsed ? "w-[68px]" : "w-[248px]"}`}>
        <Brand collapsed={collapsed} />
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks collapsed={collapsed} alertCount={alertCount} />
        </div>
        <button type="button" onClick={toggleCollapsed} className="m-2 flex h-9 items-center gap-2 rounded-lg px-3 text-[12.5px] text-sidebar-ink hover:bg-sidebar-2 hover:text-white" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && "Collapse"}
        </button>
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-sidebar fade-in">
            <div className="flex items-center justify-between pr-2">
              <Brand collapsed={false} />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-sidebar-ink hover:bg-sidebar-2" aria-label="Close navigation">
                <X size={18} />
              </button>
            </div>
            <NavLinks collapsed={false} alertCount={alertCount} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-page/85 px-4 backdrop-blur md:px-6">
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <form action="/search" className="relative max-w-md flex-1" role="search">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
            <label htmlFor="global-search" className="sr-only">
              Search employees, IDs, tasks, leave requests, processes or dates
            </label>
            <input id="global-search" name="q" placeholder="Search name, ID, task, leave, process, date…" className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/data-sources" title={sync.title} className="hidden items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-2 hover:bg-surface-2 sm:flex">
              <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
              <span className="sr-only">Sync status:</span>
              {sync.label}
            </Link>
            <button type="button" onClick={toggleTheme} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2" aria-label="Toggle dark mode">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden" aria-label="Account">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                  {user.name
                    .split(/\s+/)
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
              </summary>
              <div className="absolute right-0 mt-2 w-60 rounded-xl border border-line-strong bg-surface p-3 shadow-lg">
                <p className="text-[13px] font-medium text-ink">{user.name}</p>
                <p className="truncate text-[12px] text-ink-2">{user.email}</p>
                <p className="mt-1 text-[12px] text-muted capitalize">Role: {user.role}</p>
                <Link href="/logout" className="mt-3 block rounded-lg border border-line-strong px-3 py-1.5 text-center text-[12.5px] font-medium text-ink hover:bg-surface-2">
                  Sign out
                </Link>
              </div>
            </details>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
