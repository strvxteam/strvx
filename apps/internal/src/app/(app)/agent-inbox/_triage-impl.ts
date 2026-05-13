// Pure-ish business logic for triage server actions (archive, snooze, labels).
// Kept in a separate module so tests can import it without dragging in
// Next's "use server" runtime, and so auth resolution can be injected.

import { eq, sql } from "drizzle-orm";
import { db, emailThreads } from "@strvx/db";

export type TriageDeps = {
  /** Resolves the internal users.id for the caller; null = unauthorized. */
  getCallerUserId: () => Promise<string | null>;
};

/**
 * Archive a thread by setting `archived_at = now()`. Idempotent — re-archiving
 * an already-archived thread updates the timestamp but does not error.
 */
export async function archiveThreadImpl(
  threadId: string,
  deps: TriageDeps
): Promise<{ ok: true }> {
  if (!threadId || typeof threadId !== "string") {
    throw new Error("threadId required");
  }
  const userId = await deps.getCallerUserId();
  if (!userId) throw new Error("Unauthorized");

  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  if (!thread) throw new Error("Thread not found");

  const now = new Date();
  await db
    .update(emailThreads)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(emailThreads.id, threadId));

  console.log("[triage] archived thread", { threadId, userId });
  return { ok: true };
}

/**
 * Snooze a thread until `until`. Sets snoozed_until and agent_state='snoozed'.
 * `until` must be a valid Date in the future.
 */
export async function snoozeThreadImpl(
  threadId: string,
  untilISO: string,
  deps: TriageDeps
): Promise<{ ok: true }> {
  if (!threadId || typeof threadId !== "string") {
    throw new Error("threadId required");
  }
  if (!untilISO || typeof untilISO !== "string") {
    throw new Error("until required");
  }
  const until = new Date(untilISO);
  if (Number.isNaN(until.getTime())) {
    throw new Error("Invalid until date");
  }
  const nowMs = Date.now();
  if (until.getTime() <= nowMs) {
    throw new Error("until must be in the future");
  }
  // Cap snooze horizon at 90 days so we don't accidentally bury work
  // forever when a typo creeps into the custom picker.
  const MAX_SNOOZE_MS = 90 * 24 * 60 * 60 * 1000;
  if (until.getTime() - nowMs > MAX_SNOOZE_MS) {
    throw new Error("until must be within 90 days");
  }
  const userId = await deps.getCallerUserId();
  if (!userId) throw new Error("Unauthorized");

  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  if (!thread) throw new Error("Thread not found");

  const now = new Date();
  await db
    .update(emailThreads)
    .set({
      snoozedUntil: until,
      agentState: "snoozed",
      updatedAt: now,
    })
    .where(eq(emailThreads.id, threadId));

  console.log("[triage] snoozed thread", {
    threadId,
    userId,
    until: until.toISOString(),
  });
  return { ok: true };
}

// ── Labels ─────────────────────────────────────────────────────────────────

const LABEL_MAX_LEN = 40;
const LABEL_PATTERN = /^[a-z0-9-]+$/;

/**
 * Normalize a user-supplied label string. Lowercases, trims surrounding
 * whitespace, replaces interior whitespace + underscores with dashes, and
 * validates against the allowed alphabet (a-z, 0-9, dash). Returns `null`
 * if the normalized form is empty, too long, or contains invalid chars.
 */
export function normalizeLabel(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    // collapse runs of dashes that arose from the substitution
    .replace(/-+/g, "-")
    // strip leading/trailing dashes
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return null;
  if (cleaned.length > LABEL_MAX_LEN) return null;
  if (!LABEL_PATTERN.test(cleaned)) return null;
  return cleaned;
}

/**
 * Add a label to a thread's `labels` array. Idempotent — duplicate
 * inserts are de-duped at the SQL layer via array_remove + concat. Returns
 * the normalized label (so callers can show what was actually stored).
 */
export async function addLabelImpl(
  threadId: string,
  rawLabel: string,
  deps: TriageDeps
): Promise<{ ok: true; label: string }> {
  if (!threadId || typeof threadId !== "string") {
    throw new Error("threadId required");
  }
  const label = normalizeLabel(rawLabel);
  if (!label) {
    throw new Error(
      `Invalid label. Use lowercase a–z, 0–9, dashes; max ${LABEL_MAX_LEN} chars.`
    );
  }
  const userId = await deps.getCallerUserId();
  if (!userId) throw new Error("Unauthorized");

  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  if (!thread) throw new Error("Thread not found");

  // De-dupe + append in a single update. `array_remove` strips any
  // existing copies; concatenation re-adds exactly one.
  await db
    .update(emailThreads)
    .set({
      labels: sql`array_remove(${emailThreads.labels}, ${label}) || ARRAY[${label}]::text[]`,
      updatedAt: new Date(),
    })
    .where(eq(emailThreads.id, threadId));

  console.log("[triage] added label", { threadId, userId, label });
  return { ok: true, label };
}

/**
 * Remove a label from a thread's `labels` array. Idempotent — removing
 * a label that isn't there is a no-op. Returns the normalized label.
 */
export async function removeLabelImpl(
  threadId: string,
  rawLabel: string,
  deps: TriageDeps
): Promise<{ ok: true; label: string }> {
  if (!threadId || typeof threadId !== "string") {
    throw new Error("threadId required");
  }
  const label = normalizeLabel(rawLabel);
  if (!label) {
    throw new Error(
      `Invalid label. Use lowercase a–z, 0–9, dashes; max ${LABEL_MAX_LEN} chars.`
    );
  }
  const userId = await deps.getCallerUserId();
  if (!userId) throw new Error("Unauthorized");

  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);
  if (!thread) throw new Error("Thread not found");

  await db
    .update(emailThreads)
    .set({
      labels: sql`array_remove(${emailThreads.labels}, ${label})`,
      updatedAt: new Date(),
    })
    .where(eq(emailThreads.id, threadId));

  console.log("[triage] removed label", { threadId, userId, label });
  return { ok: true, label };
}
