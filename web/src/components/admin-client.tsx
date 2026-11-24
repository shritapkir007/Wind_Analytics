"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { acknowledgeAlert, addUser, setUserRole, syncNow, updateSettings } from "@/app/(app)/admin-actions";
import { btn, input } from "./ui";

export function SyncButtons({ allowed }: { allowed: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "good" | "critical" | "warning"; text: string } | null>(null);
  const go = (mode: "quick" | "full") =>
    start(async () => {
      setMsg(null);
      try {
        const r = await syncNow(mode);
        setMsg({ tone: r.status === "success" ? "good" : r.status === "partial" ? "warning" : "critical", text: r.status === "success" ? `Sync complete · ${r.issues} data-quality notes` : r.status === "skipped" ? "A sync is already running" : `Sync ${r.status}: ${r.error ?? ""}` });
      } catch (e) {
        setMsg({ tone: "critical", text: (e as Error).message });
      }
    });
  if (!allowed) return <span className="text-[12.5px] text-muted">Managers and admins can run a manual sync.</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn.primary} disabled={pending} onClick={() => go("quick")}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Sync now
      </button>
      <button type="button" className={btn.secondary} disabled={pending} onClick={() => go("full")} title="Also reconciles every per-process pivot tab">
        Full sync + reconciliation
      </button>
      {msg && (
        <span role="status" className={`text-[12.5px] ${msg.tone === "good" ? "text-good" : msg.tone === "warning" ? "text-ink" : "text-critical"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

export function AckButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={btn.ghost} disabled={pending} onClick={() => start(() => acknowledgeAlert(id))}>
      <Check size={14} aria-hidden /> Acknowledge
    </button>
  );
}

export function SettingsForm({ children }: { children: React.ReactNode }) {
  const [state, action, pending] = useActionState(updateSettings, { ok: false } as { ok: boolean; error?: string });
  return (
    <form action={action}>
      {children}
      <div className="mt-5 flex items-center gap-3">
        <button type="submit" className={btn.primary} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.ok && (
          <span role="status" className="text-[12.5px] text-good">
            Saved · alerts recalculated
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-[12.5px] text-critical">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

export function RoleSelect({ email, role, disabled }: { email: string; role: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`Role for ${email}`}
        defaultValue={role}
        disabled={disabled || pending}
        onChange={(e) =>
          start(async () => {
            try {
              await setUserRole(email, e.target.value);
              setErr(null);
            } catch (x) {
              setErr((x as Error).message);
            }
          })
        }
        className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[12.5px] text-ink"
      >
        {["viewer", "lead", "manager", "admin"].map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      {err && <span className="text-[11.5px] text-critical">{err}</span>}
    </span>
  );
}

export function AddUser({ domain }: { domain: string }) {
  const [state, action, pending] = useActionState(addUser, { ok: false } as { ok: boolean; error?: string });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-[12px] text-ink-2">
        Email
        <input name="email" type="email" required placeholder={`name@${domain}`} className={`${input} w-64`} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-ink-2">
        Role
        <select name="role" defaultValue="viewer" className={`${input} w-36`}>
          {["viewer", "lead", "manager", "admin"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <button className={btn.secondary} type="submit" disabled={pending}>
        Add / update
      </button>
      {state.error && <span className="text-[12px] text-critical">{state.error}</span>}
      {state.ok && <span className="text-[12px] text-good">Saved</span>}
    </form>
  );
}
