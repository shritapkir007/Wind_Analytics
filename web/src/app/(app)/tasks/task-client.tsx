"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { createTask, deleteTask, updateTask, type ActionState } from "./actions";
import { btn, input } from "@/components/ui";

const STATUSES = ["Not Started", "In Progress", "Pending", "Under Review", "On Hold", "Completed"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const label = "mb-1 block text-[12px] font-medium text-ink-2";

export function NewTask({ employees, processes, tasks, today }: { employees: { key: string; name: string }[]; processes: string[]; tasks: { id: number; title: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(createTask, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      form.current?.reset();
      setOpen(false);
    }
  }, [state]);
  return (
    <>
      <button type="button" className={btn.primary} onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden /> New task
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
          <form
            ref={form}
            onSubmit={(e) => {
              // Submit manually so React does not clear the fields when validation fails.
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(() => action(fd));
            }}
            className="fade-in w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="new-task-title" className="text-[17px] font-semibold text-ink">
                Create & assign task
              </h2>
              <button type="button" onClick={() => setOpen(false)} className={btn.ghost} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="t-title">
                  Task description (title) *
                </label>
                <input id="t-title" name="title" required minLength={3} maxLength={200} className={input} />
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="t-desc">
                  Details
                </label>
                <textarea id="t-desc" name="description" rows={3} className={`${input} h-auto py-2`} />
              </div>
              <div>
                <label className={label} htmlFor="t-assignee">
                  Assigned employee
                </label>
                <select id="t-assignee" name="assigneeKey" className={input} defaultValue="">
                  <option value="">Unassigned</option>
                  {employees.map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="t-project">
                  Project
                </label>
                <input id="t-project" name="project" maxLength={120} className={input} placeholder="e.g. Site / client / initiative" />
              </div>
              <div>
                <label className={label} htmlFor="t-process">
                  Work category / process
                </label>
                <select id="t-process" name="process" className={input} defaultValue="">
                  <option value="">—</option>
                  {processes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="t-priority">
                  Priority
                </label>
                <select id="t-priority" name="priority" className={input} defaultValue="Medium">
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="t-assigned">
                  Assignment date
                </label>
                <input id="t-assigned" name="assignedOn" type="date" defaultValue={today} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="t-due">
                  Due date
                </label>
                <input id="t-due" name="dueOn" type="date" className={input} />
              </div>
              <div>
                <label className={label} htmlFor="t-status">
                  Status
                </label>
                <select id="t-status" name="status" className={input} defaultValue="Not Started">
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="t-deps">
                  Depends on
                </label>
                <select id="t-deps" name="dependsOn" multiple className={`${input} h-20 py-1`}>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      TSK-{String(t.id).padStart(4, "0")} {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label} htmlFor="t-remarks">
                  Remarks
                </label>
                <input id="t-remarks" name="remarks" maxLength={4000} className={input} />
              </div>
            </div>
            {state.error && (
              <p role="alert" className="mt-4 rounded-lg bg-critical-soft px-3 py-2 text-[13px] text-critical">
                {state.error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={btn.primary} disabled={pending}>
                {pending ? "Saving…" : "Create task"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function StatusSelect({ id, status, disabled }: { id: number; status: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <label className="sr-only" htmlFor={`st-${id}`}>
        Status
      </label>
      <select
        id={`st-${id}`}
        disabled={disabled || pending}
        defaultValue={status}
        onChange={(e) =>
          start(async () => {
            const r = await updateTask(id, { status: e.target.value as never });
            setErr(r.ok ? null : r.error ?? "Failed");
          })
        }
        className="h-7 rounded-md border border-line-strong bg-surface px-1.5 text-[12px] text-ink disabled:opacity-60"
      >
        {STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {err && (
        <span className="text-[11px] text-critical" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}

export function DueInput({ id, due, disabled }: { id: number; due: string | null; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      aria-label="Due date"
      defaultValue={due ?? ""}
      disabled={disabled || pending}
      onChange={(e) => start(async () => void (await updateTask(id, { dueOn: e.target.value })))}
      className="h-7 rounded-md border border-line-strong bg-surface px-1.5 text-[12px] text-ink disabled:opacity-60"
    />
  );
}

export function DeleteTask({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete TSK-${String(id).padStart(4, "0")}? This cannot be undone.`)) start(async () => void (await deleteTask(id)));
      }}
      className="rounded-md p-1 text-muted hover:bg-critical-soft hover:text-critical"
      aria-label="Delete task"
    >
      <Trash2 size={14} />
    </button>
  );
}
