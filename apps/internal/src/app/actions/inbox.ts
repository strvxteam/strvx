"use server";

import { db } from "@/lib/db";
import { tasks, nextActions } from "@strvx/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../actions";

export async function toggleTaskDone(input: { taskId: string; snooze?: number }) {
  await getCurrentUser();
  if (input.snooze) {
    // Push due date forward
    await db
      .update(tasks)
      .set({ dueDate: sql`to_char(now() + (${input.snooze} || ' days')::interval, 'YYYY-MM-DD')` })
      .where(eq(tasks.id, input.taskId));
  } else {
    // Toggle done state
    const [current] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, input.taskId));
    const nextStatus = current?.status === "done" ? "todo" : "done";
    const completedAt = nextStatus === "done" ? new Date() : null;
    await db.update(tasks).set({ status: nextStatus, completedAt }).where(eq(tasks.id, input.taskId));
  }
  revalidatePath("/dashboard");
  return { success: true as const };
}

export async function toggleNextActionDone(input: { actionId: string }) {
  await getCurrentUser();
  const [current] = await db
    .select({ completed: nextActions.completed })
    .from(nextActions)
    .where(eq(nextActions.id, input.actionId));
  const next = !current?.completed;
  await db
    .update(nextActions)
    .set({ completed: next, completedAt: next ? new Date() : null })
    .where(eq(nextActions.id, input.actionId));
  revalidatePath("/dashboard");
  return { success: true as const };
}

export async function snoozeStaleEngagement(input: { engagementId: string; days: number }) {
  // Records an implicit "ping" by inserting a zero-content interaction, bumping last_interaction_at.
  // Alternative: add a dedicated `snoozed_until` column. For MVP, use the interaction approach.
  await getCurrentUser();
  const { quickAdd } = await import("../actions");
  const formData = new FormData();
  formData.append("engagementId", input.engagementId);
  formData.append("content", `/note snoozed ${input.days}d`);
  await quickAdd(formData);
  revalidatePath("/dashboard");
  return { success: true as const };
}

export async function dismissAlert(_input: { kind: "deploy" | "monitor" | "invoice"; id: string }) {
  // For MVP, alerts are read-only. Dismissal requires a new `dismissed_alerts` table.
  // Stub: log and no-op. Add a follow-up task to persist dismissals.
  console.log(`[inbox] dismiss alert (no-op):`, _input);
  return { success: true as const };
}
