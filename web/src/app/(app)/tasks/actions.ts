"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { nowIso, todayIST } from "@/lib/config";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain/metrics";
import { refreshAlerts } from "@/lib/domain/alerts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TaskInput = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().trim().max(4000).default(""),
  project: z.string().trim().max(120).default(""),
  process: z.string().trim().max(120).optional().transform((v) => v || null),
  assigneeKey: z.string().trim().max(200).optional().transform((v) => v || null),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES).default("Not Started"),
  assignedOn: isoDate.optional(),
  dueOn: isoDate.optional().or(z.literal("")).transform((v) => v || null),
  remarks: z.string().trim().max(4000).default(""),
  dependsOn: z.array(z.coerce.number().int().positive()).default([]),
});

export interface ActionState {
  ok: boolean;
  error?: string;
}

function fromForm(fd: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k === "dependsOn") (o.dependsOn = (o.dependsOn as unknown[]) ?? []).push(v);
    else o[k] = typeof v === "string" ? v : undefined;
  }
  return o;
}

async function refreshAlertsSafe() {
  try {
    await refreshAlerts();
  } catch (e) {
    console.error(e);
  }
}

export async function createTask(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("lead");
    const parsed = TaskInput.safeParse(fromForm(fd));
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    const t = parsed.data;
    if (t.dueOn && t.assignedOn && t.dueOn < t.assignedOn) return { ok: false, error: "Due date is before the assignment date" };
    const db = await getDb();
    const now = nowIso();
    const [row] = await db
      .insert(schema.tasks)
      .values({ ...t, assignedOn: t.assignedOn ?? todayIST(), assignedBy: user.email, completedOn: t.status === "Completed" ? todayIST() : null, createdAt: now, updatedAt: now })
      .returning({ id: schema.tasks.id });
    await db.insert(schema.taskEvents).values({ taskId: row.id, actor: user.email, field: "created", oldValue: null, newValue: t.title, at: now });
    revalidatePath("/tasks");
    await refreshAlertsSafe();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateTask(id: number, patch: Partial<z.input<typeof TaskInput>>): Promise<ActionState> {
  try {
    const user = await requireRole("lead");
    const parsed = TaskInput.partial().safeParse(patch);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    const db = await getDb();
    const [cur] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    if (!cur) return { ok: false, error: "Task not found" };
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined && JSON.stringify((cur as Record<string, unknown>)[k]) !== JSON.stringify(v)) next[k] = v;
    if (next.status === "Completed" && !cur.completedOn) next.completedOn = todayIST();
    if (next.status && next.status !== "Completed" && cur.completedOn) next.completedOn = null;
    if (!Object.keys(next).length) return { ok: true };
    const now = nowIso();
    await db.update(schema.tasks).set({ ...next, updatedAt: now }).where(eq(schema.tasks.id, id));
    await db.insert(schema.taskEvents).values(
      Object.entries(next).map(([field, v]) => ({ taskId: id, actor: user.email, field, oldValue: String((cur as Record<string, unknown>)[field] ?? ""), newValue: String(v ?? ""), at: now })),
    );
    revalidatePath("/tasks");
    await refreshAlertsSafe();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteTask(id: number): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const db = await getDb();
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
    await db.insert(schema.taskEvents).values({ taskId: id, actor: user.email, field: "deleted", oldValue: null, newValue: null, at: nowIso() });
    revalidatePath("/tasks");
    await refreshAlertsSafe();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
