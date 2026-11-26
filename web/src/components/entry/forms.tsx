"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react";
import * as A from "@/app/(app)/entry-actions";
import { LEAVE_REQUEST_TYPES, OVERRIDE_CODES, STREAMS, WEEKDAYS } from "@/lib/entry/catalog";
import { upperEnd } from "@/lib/targets";
import { btn, input } from "@/components/ui";

type Result = A.Result;
const label = "mb-1 block text-[12px] font-medium text-ink-2";

function useAction() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) {
        router.refresh();
        after?.(r);
      }
    });
  return { pending, res, run, setRes };
}

function Status({ res }: { res: Result | null }) {
  if (!res) return null;
  return (
    <p role={res.ok ? "status" : "alert"} className={`text-[12.5px] ${res.ok ? "text-good" : "text-critical"}`}>
      {res.ok ? res.message ?? "Saved" : res.error}
    </p>
  );
}

function Submit({ pending, children, variant = "primary" }: { pending: boolean; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <button type="submit" className={variant === "primary" ? btn.primary : btn.secondary} disabled={pending}>
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden />} {children}
    </button>
  );
}

// ------------------------------------------------------------------ daily output

export interface ProcessOption {
  column: string;
  label: string;
  family: string;
  target: number | null;
}

export function OutputForm({
  employeeKey,
  date,
  today,
  processes,
  usual,
  existing,
}: {
  employeeKey: string;
  date: string;
  today: string;
  processes: ProcessOption[];
  usual: string[];
  existing: { entries: Record<string, number>; otherWork: string | null } | null;
}) {
  const router = useRouter();
  const { pending, res, run } = useAction();
  const [showAll, setShowAll] = useState(usual.length === 0);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(existing?.entries ?? {}).map(([k, v]) => [k, String(v)])));
  const [other, setOther] = useState(existing?.otherWork ?? "");
  const shown = useMemo(() => {
    const keep = new Set([...usual, ...Object.keys(existing?.entries ?? {})]);
    return showAll ? processes : processes.filter((p) => keep.has(p.column));
  }, [showAll, processes, usual, existing]);
  const targetDays = shown.reduce((a, p) => a + (p.target && Number(values[p.column]) > 0 ? Number(values[p.column]) / p.target : 0), 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const entries = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "" && !Number.isNaN(Number(v))).map(([k, v]) => [k, Number(v)]));
        run(() => A.saveOutput({ employeeKey, date, entries, otherWork: other }));
      }}
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className={label} htmlFor="o-date">
            Output date
          </label>
          <input
            id="o-date"
            type="date"
            className={`${input} w-44`}
            value={date}
            max={today}
            onChange={(e) => {
              const u = new URL(window.location.href);
              u.searchParams.set("date", e.target.value);
              router.push(u.pathname + u.search);
            }}
          />
        </div>
        <p className="pb-2 text-[12.5px] text-ink-2">
          {existing ? "Editing the saved entry for this day." : "No entry yet for this day."} Target-days so far: <strong className="tnum text-ink">{targetDays.toFixed(2)}</strong>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <div key={p.column}>
            <label className={label} htmlFor={`o-${p.column}`}>
              {p.label} <span className="font-normal text-muted">{p.target ? `· target ${p.target}/day` : "· no target"}</span>
            </label>
            <input
              id={`o-${p.column}`}
              inputMode="decimal"
              type="number"
              min={0}
              step="0.01"
              className={input}
              value={values[p.column] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p.column]: e.target.value }))}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <button type="button" className={`${btn.ghost} mt-2`} onClick={() => setShowAll((s) => !s)}>
        {showAll ? "Show only my usual processes" : `Show all ${processes.length} processes`}
      </button>
      <div className="mt-3">
        <label className={label} htmlFor="o-other">
          Extra tasks / other work (optional)
        </label>
        <textarea id="o-other" rows={2} maxLength={2000} className={`${input} h-auto py-2`} value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. 2 QI resolved turbines, reshoot initiated for T-14, training session" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Submit pending={pending}>{existing ? "Update output" : "Save output"}</Submit>
        <Status res={res} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ leave / WFH / working requests

export function LeaveForm({ employeeKey, today }: { employeeKey: string; today: string }) {
  const { pending, res, run } = useAction();
  const [type, setType] = useState<string>("EL");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [half, setHalf] = useState("");
  const kind = LEAVE_REQUEST_TYPES.find((t) => t.value === type)?.kind;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () =>
            A.requestLeave({
              employeeKey,
              type: type as never,
              startDate: start,
              endDate: half ? start : end,
              halfDay: (half || "") as never,
              unplanned: fd.get("unplanned") === "on",
              reason: String(fd.get("reason") ?? ""),
            }),
          () => (e.target as HTMLFormElement).reset(),
        );
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label className={label} htmlFor="l-type">
          Request
        </label>
        <select id="l-type" className={input} value={type} onChange={(e) => setType(e.target.value)}>
          {LEAVE_REQUEST_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="l-start">
          From
        </label>
        <input id="l-start" type="date" className={input} value={start} onChange={(e) => (setStart(e.target.value), end < e.target.value && setEnd(e.target.value))} required />
      </div>
      <div>
        <label className={label} htmlFor="l-end">
          To
        </label>
        <input id="l-end" type="date" className={input} value={half ? start : end} min={start} disabled={Boolean(half)} onChange={(e) => setEnd(e.target.value)} required />
      </div>
      {kind === "leave" && (
        <div>
          <label className={label} htmlFor="l-half">
            Half day?
          </label>
          <select id="l-half" className={input} value={half} onChange={(e) => setHalf(e.target.value)}>
            <option value="">No, full day(s)</option>
            <option value="first">First half</option>
            <option value="second">Second half</option>
          </select>
        </div>
      )}
      {kind === "leave" && (
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
          <input type="checkbox" name="unplanned" className="h-4 w-4 accent-[var(--accent)]" /> Unplanned (emergency / sick)
        </label>
      )}
      <div className="sm:col-span-2">
        <label className={label} htmlFor="l-reason">
          Reason
        </label>
        <input id="l-reason" name="reason" className={input} required minLength={2} maxLength={1000} placeholder="Short reason for your lead" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Submit pending={pending}>Send for approval</Submit>
        <Status res={res} />
      </div>
    </form>
  );
}

export function CancelLeave({ id }: { id: string }) {
  const { pending, res, run } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={btn.ghost} disabled={pending} onClick={() => confirm(`Cancel ${id}?`) && run(() => A.cancelLeave(id))}>
        <X size={13} aria-hidden /> Cancel
      </button>
      {res && !res.ok && <span className="text-[11.5px] text-critical">{res.error}</span>}
    </span>
  );
}

// ------------------------------------------------------------------ overtime

export function OvertimeForm({ employeeKey, today, processes }: { employeeKey: string; today: string; processes: string[] }) {
  const { pending, res, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "");
        run(() => A.logOvertime({ employeeKey, date: g("date"), process: g("process"), timeStart: g("start"), timeEnd: g("end"), shift: g("shift") as never, turbines: g("turbines"), notes: g("notes") }), () => (e.target as HTMLFormElement).reset());
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div>
        <label className={label} htmlFor="ot-date">
          Date worked
        </label>
        <input id="ot-date" name="date" type="date" max={today} defaultValue={today} className={input} required />
      </div>
      <div>
        <label className={label} htmlFor="ot-shift">
          Shift
        </label>
        <select id="ot-shift" name="shift" className={input} defaultValue="Full Day">
          <option>Full Day</option>
          <option>Half Day</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="ot-start">
          Start time
        </label>
        <input id="ot-start" name="start" type="time" defaultValue="09:30" className={input} required />
      </div>
      <div>
        <label className={label} htmlFor="ot-end">
          End time
        </label>
        <input id="ot-end" name="end" type="time" defaultValue="18:30" className={input} required />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="ot-process">
          Work done
        </label>
        <input id="ot-process" name="process" list="ot-processes" className={input} required placeholder="e.g. Ext FQC" />
        <datalist id="ot-processes">
          {processes.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div>
        <label className={label} htmlFor="ot-turbines">
          Turbines delivered
        </label>
        <input id="ot-turbines" name="turbines" className={input} placeholder="e.g. 10 FQC" />
      </div>
      <div>
        <label className={label} htmlFor="ot-notes">
          Notes
        </label>
        <input id="ot-notes" name="notes" className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Submit pending={pending}>Send for approval</Submit>
        <Status res={res} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ approvals

export function Decision({ kind, id }: { kind: "leave" | "overtime"; id: string }) {
  const { pending, res, run } = useAction();
  const [comment, setComment] = useState("");
  const go = (d: "Approved" | "Declined") => run(() => (kind === "leave" ? A.decideLeave(id, d, comment) : A.decideOvertime(id, d, comment)));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`c-${id}`}>
        Comment
      </label>
      <input id={`c-${id}`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" className="h-8 w-44 rounded-md border border-line-strong bg-surface px-2 text-[12.5px] text-ink" />
      <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--good-mark)] px-2.5 text-[12.5px] font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => go("Approved")}>
        <Check size={14} aria-hidden /> Approve
      </button>
      <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-line-strong px-2.5 text-[12.5px] font-medium text-critical disabled:opacity-50" disabled={pending} onClick={() => go("Declined")}>
        <X size={14} aria-hidden /> Decline
      </button>
      {pending && <Loader2 size={14} className="animate-spin text-muted" aria-label="Saving" />}
      {res && <Status res={res} />}
    </div>
  );
}

// ------------------------------------------------------------------ inventory

export interface InventoryRow {
  stream: string;
  expected: number;
  uploaded: number;
  inventory: number;
  qualityIssues: number;
  duplicates: number;
  lateUploads: number;
  auditCount: number;
  delivered: number;
  deliveredManual: boolean;
}

const INV_FIELDS: [keyof InventoryRow, string][] = [
  ["uploaded", "Uploaded"],
  ["inventory", "Current inventory"],
  ["qualityIssues", "Open quality issues"],
  ["duplicates", "Duplicate turbines"],
  ["lateUploads", "Late uploads"],
  ["auditCount", "Audit count"],
  ["expected", "Expected / day"],
];

export function InventoryForm({ date, today, rows }: { date: string; today: string; rows: InventoryRow[] }) {
  const router = useRouter();
  const { pending, res, run } = useAction();
  const [vals, setVals] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(STREAMS.map((s) => {
      const r = rows.find((x) => x.stream === s);
      return [s, Object.fromEntries([...INV_FIELDS.map(([k]) => [k, r ? String(r[k]) : ""]), ["delivered", r?.deliveredManual ? String(r.delivered) : ""]])];
    })),
  );
  const calc = Object.fromEntries(rows.map((r) => [r.stream, r.delivered]));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          A.saveInventory({
            date,
            rows: STREAMS.map((s) => {
              const v = vals[s];
              const n = (k: string) => (v[k] === "" ? 0 : Number(v[k]));
              return { stream: s, expected: n("expected"), uploaded: n("uploaded"), inventory: n("inventory"), qualityIssues: n("qualityIssues"), duplicates: n("duplicates"), lateUploads: n("lateUploads"), auditCount: n("auditCount"), delivered: v.delivered === "" ? "" : Number(v.delivered) };
            }),
          }),
        );
      }}
    >
      <div className="mb-4 w-44">
        <label className={label} htmlFor="inv-date">
          Date
        </label>
        <input
          id="inv-date"
          type="date"
          className={`${input} w-44`}
          value={date}
          max={today}
          onChange={(e) => router.push(`/inventory?date=${e.target.value}`)}
        />
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-[12px] text-ink-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Measure
              </th>
              {STREAMS.map((s) => (
                <th key={s} scope="col" className="px-3 py-2 text-left font-medium">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...INV_FIELDS, ["delivered", "Delivered (leave empty = from FQC output)"] as [string, string]].map(([k, l]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left font-normal text-ink-2">
                  {l}
                </th>
                {STREAMS.map((s) => (
                  <td key={s} className="px-3 py-1.5">
                    <label className="sr-only" htmlFor={`inv-${s}-${k}`}>{`${s} ${l}`}</label>
                    <input
                      id={`inv-${s}-${k}`}
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 w-full min-w-[90px] rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink"
                      value={vals[s][k]}
                      placeholder={k === "delivered" ? `${calc[s] ?? 0} (calculated)` : "0"}
                      onChange={(e) => setVals((v) => ({ ...v, [s]: { ...v[s], [k]: e.target.value } }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Submit pending={pending}>Save inventory for {date}</Submit>
        <Status res={res} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ attendance override (lead)

export function AttendanceOverrideForm({ people, today }: { people: { key: string; name: string }[]; today: string }) {
  const { pending, res, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const code = String(f.get("code"));
        run(() => A.setAttendance(String(f.get("who")), String(f.get("date")), code === "__auto" ? null : code, String(f.get("note") ?? "")));
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <label className={label} htmlFor="ov-who">
          Person
        </label>
        <select id="ov-who" name="who" className={`${input} w-52`} required>
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="ov-date">
          Date
        </label>
        <input id="ov-date" name="date" type="date" defaultValue={today} className={`${input} w-40`} required />
      </div>
      <div>
        <label className={label} htmlFor="ov-code">
          Mark as
        </label>
        <select id="ov-code" name="code" className={`${input} w-52`} defaultValue="LoP">
          <option value="__auto">Automatic (remove manual mark)</option>
          {OVERRIDE_CODES.map((c) => (
            <option key={c.value || "present"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="ov-note">
          Note
        </label>
        <input id="ov-note" name="note" className={`${input} w-52`} />
      </div>
      <Submit pending={pending}>Apply</Submit>
      <Status res={res} />
    </form>
  );
}

// ------------------------------------------------------------------ roster

export interface EmployeeFormValue {
  key?: string;
  name: string;
  email: string;
  role: string;
  section: string;
  employeeCode: string;
  weekOff: number[];
  workLocation: string;
  joinedOn: string;
  leftOn: string;
  isActive: boolean;
}

export function EmployeeForm({ value, sections, onDone }: { value?: EmployeeFormValue; sections: string[]; onDone?: () => void }) {
  const { pending, res, run } = useAction();
  const v = value ?? { name: "", email: "", role: "", section: sections[0] ?? "", employeeCode: "", weekOff: [0, 6], workLocation: "office", joinedOn: "", leftOn: "", isActive: true };
  const [off, setOff] = useState<number[]>(v.weekOff);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "");
        run(
          () =>
            A.saveEmployee({
              originalKey: v.key,
              name: g("name"),
              email: g("email"),
              role: g("role"),
              section: g("section") === "__new" ? g("newSection") : g("section"),
              employeeCode: g("code"),
              weekOff: off,
              workLocation: g("location") as never,
              joinedOn: g("joined"),
              leftOn: g("left"),
              isActive: f.get("active") === "on",
            }),
          () => onDone?.(),
        );
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div>
        <label className={label} htmlFor="e-name">Name</label>
        <input id="e-name" name="name" defaultValue={v.name} className={input} required minLength={2} />
      </div>
      <div>
        <label className={label} htmlFor="e-email">Work email</label>
        <input id="e-email" name="email" type="email" defaultValue={v.email} className={input} required readOnly={Boolean(v.key)} />
      </div>
      <div>
        <label className={label} htmlFor="e-role">Designation</label>
        <input id="e-role" name="role" defaultValue={v.role} className={input} placeholder="e.g. Engineer 2" />
      </div>
      <div>
        <label className={label} htmlFor="e-section">Team / sub-team</label>
        <select id="e-section" name="section" defaultValue={v.section} className={input}>
          {sections.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value="__new">+ New team…</option>
        </select>
        <input name="newSection" className={`${input} mt-1`} placeholder="New team name (if '+ New team')" />
      </div>
      <div>
        <label className={label} htmlFor="e-code">Employee ID</label>
        <input id="e-code" name="code" defaultValue={v.employeeCode} className={input} placeholder="FW123" />
      </div>
      <div>
        <label className={label} htmlFor="e-location">Usual place of work</label>
        <select id="e-location" name="location" defaultValue={v.workLocation} className={input}>
          <option value="office">Office</option>
          <option value="wfh">Work from home</option>
        </select>
      </div>
      <fieldset className="sm:col-span-2 lg:col-span-1">
        <legend className={label}>Weekly days off</legend>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d, i) => (
            <label key={d} className={`cursor-pointer rounded-md border px-2 py-1 text-[12px] ${off.includes(i) ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-ink-2"}`}>
              <input type="checkbox" className="sr-only" checked={off.includes(i)} onChange={() => setOff((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]))} />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className={label} htmlFor="e-joined">Joined on</label>
        <input id="e-joined" name="joined" type="date" defaultValue={v.joinedOn} className={input} />
      </div>
      <div>
        <label className={label} htmlFor="e-left">Last working day</label>
        <input id="e-left" name="left" type="date" defaultValue={v.leftOn} className={input} />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
        <input type="checkbox" name="active" defaultChecked={v.isActive} className="h-4 w-4 accent-[var(--accent)]" /> Active
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <Submit pending={pending}>{v.key ? "Save changes" : "Add person"}</Submit>
        <Status res={res} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ holidays, targets, go-live

export function HolidayManager({ holidays }: { holidays: { date: string; name: string }[] }) {
  const { pending, res, run } = useAction();
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() => A.saveHoliday(String(f.get("date")), String(f.get("name"))), () => (e.target as HTMLFormElement).reset());
        }}
        className="mb-3 flex flex-wrap items-end gap-2"
      >
        <div>
          <label className={label} htmlFor="h-date">Date</label>
          <input id="h-date" name="date" type="date" className={`${input} w-40`} required />
        </div>
        <div>
          <label className={label} htmlFor="h-name">Holiday</label>
          <input id="h-name" name="name" className={`${input} w-56`} required placeholder="e.g. Diwali" />
        </div>
        <Submit pending={pending} variant="secondary"><Plus size={14} aria-hidden /> Add</Submit>
        <Status res={res} />
      </form>
      <ul className="flex flex-col">
        {holidays.map((h) => (
          <li key={h.date} className="flex items-center justify-between border-b border-line py-1.5 text-[13px] last:border-0">
            <span><span className="tnum mr-3 text-ink-2">{h.date}</span>{h.name}</span>
            <button type="button" className={btn.ghost} aria-label={`Remove ${h.name}`} onClick={() => run(() => A.deleteHoliday(h.date))}>
              <Trash2 size={14} aria-hidden />
            </button>
          </li>
        ))}
        {holidays.length === 0 && <li className="text-[13px] text-muted">No holidays yet.</li>}
      </ul>
    </div>
  );
}

export function ProcessTargetsForm({ rows, editable }: { rows: { column: string; label: string; family: string; range: string }[]; editable: boolean }) {
  const { pending, res, run } = useAction();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.column, r.range])));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => A.saveProcessTargets(vals));
      }}
    >
      <div className="relative overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[12px] text-ink-2">
            <tr>
              <th scope="col" className="pb-2 font-medium">Process</th>
              <th scope="col" className="pb-2 font-medium">Target range (WTG/day)</th>
              <th scope="col" className="pb-2 text-right font-medium">100% =</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = vals[r.column] ?? "";
              const up = upperEnd(v);
              return (
                <tr key={r.column} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-ink">
                    {r.label}
                    <span className="block text-[11.5px] text-muted">{r.family}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <label className="sr-only" htmlFor={`pt-${r.column}`}>{`Target range for ${r.label}`}</label>
                    <input
                      id={`pt-${r.column}`}
                      value={v}
                      disabled={!editable}
                      onChange={(e) => setVals((x) => ({ ...x, [r.column]: e.target.value }))}
                      placeholder="e.g. 10-12"
                      className="h-8 w-28 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink disabled:opacity-70"
                    />
                  </td>
                  <td className="tnum py-1.5 text-right">{up != null ? up : <span className="text-[12px] text-warning">{v ? "invalid" : "no target"}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Submit pending={pending}>Save targets</Submit>
          <Status res={res} />
        </div>
      )}
    </form>
  );
}

export function GoLiveSwitch() {
  const { pending, res, run } = useAction();
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => A.switchToAppMode(text));
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <label className={label} htmlFor="go-live">Type START FRESH to confirm</label>
        <input id="go-live" value={text} onChange={(e) => setText(e.target.value)} className={`${input} w-56`} autoComplete="off" />
      </div>
      <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-critical px-3 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50" disabled={pending || text.trim().toUpperCase() !== "START FRESH"}>
        {pending && <Loader2 size={14} className="animate-spin" aria-hidden />} Switch to in-app data entry
      </button>
      <Status res={res} />
    </form>
  );
}

export function BackToSheetsSwitch() {
  const { pending, res, run } = useAction();
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => A.switchToSheetsMode(text));
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div>
        <label className={label} htmlFor="back-sheets">Type BACK TO SHEETS to confirm</label>
        <input id="back-sheets" value={text} onChange={(e) => setText(e.target.value)} className={`${input} w-56`} autoComplete="off" />
      </div>
      <button type="submit" className={btn.secondary} disabled={pending || text.trim().toUpperCase() !== "BACK TO SHEETS"}>
        {pending && <Loader2 size={14} className="animate-spin" aria-hidden />} Switch back to Google Sheets
      </button>
      <Status res={res} />
    </form>
  );
}

// ------------------------------------------------------------------ Zoho People (payroll)

/** On an approved request: open Zoho People to apply the same leave, then confirm it was applied. */
export function ZohoLeave({ id, url, applied }: { id: string; url: string; applied: boolean }) {
  const { pending, res, run } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {url && !applied && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-2.5 text-[12.5px] font-medium text-accent-ink hover:opacity-90">
          Apply in Zoho <ExternalLink size={13} aria-hidden />
        </a>
      )}
      {applied ? (
        <>
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-good">
            <Check size={13} aria-hidden /> Applied in Zoho
          </span>
          <button type="button" className="text-[11.5px] text-muted underline hover:text-ink" disabled={pending} onClick={() => run(() => A.markZohoApplied(id, false))}>
            Undo
          </button>
        </>
      ) : (
        <button type="button" className={btn.ghost} disabled={pending} onClick={() => run(() => A.markZohoApplied(id, true))}>
          {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />} Mark as applied
        </button>
      )}
      {res && !res.ok && <span className="text-[11.5px] text-critical">{res.error}</span>}
    </span>
  );
}
