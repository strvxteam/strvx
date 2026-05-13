"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  crmHygieneFlags,
  followUpWatchers,
  users,
} from "@strvx/db";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export type FollowUpActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function getStrvxUserRow(): Promise<
  | { ok: true; userRowId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    return { ok: false, error: "Unauthorized" };
  }
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, user.id))
    .limit(1);
  if (!userRow) {
    return { ok: false, error: "User not provisioned" };
  }
  return { ok: true, userRowId: userRow.id };
}

/**
 * Mark a hygiene flag as dismissed. Records dismissed_by + dismissed_at.
 */
export async function dismissFlag(
  flagId: string
): Promise<FollowUpActionResult> {
  const parsed = idSchema.safeParse(flagId);
  if (!parsed.success) return { ok: false, error: "Invalid flag id" };

  const auth = await getStrvxUserRow();
  if (!auth.ok) return auth;

  const now = new Date();
  await db
    .update(crmHygieneFlags)
    .set({
      status: "dismissed",
      dismissedBy: auth.userRowId,
      dismissedAt: now,
    })
    .where(eq(crmHygieneFlags.id, parsed.data));

  revalidatePath("/agent/follow-ups");
  return { ok: true };
}

/**
 * Mark a hygiene flag as resolved.
 */
export async function resolveFlag(
  flagId: string
): Promise<FollowUpActionResult> {
  const parsed = idSchema.safeParse(flagId);
  if (!parsed.success) return { ok: false, error: "Invalid flag id" };

  const auth = await getStrvxUserRow();
  if (!auth.ok) return auth;

  const now = new Date();
  await db
    .update(crmHygieneFlags)
    .set({
      status: "resolved",
      resolvedAt: now,
    })
    .where(eq(crmHygieneFlags.id, parsed.data));

  revalidatePath("/agent/follow-ups");
  return { ok: true };
}

/**
 * Cancel a pending watcher. Mostly used for stale_pipeline since the other
 * kinds auto-fire on their cron.
 */
export async function dismissWatcher(
  watcherId: string
): Promise<FollowUpActionResult> {
  const parsed = idSchema.safeParse(watcherId);
  if (!parsed.success) return { ok: false, error: "Invalid watcher id" };

  const auth = await getStrvxUserRow();
  if (!auth.ok) return auth;

  await db
    .update(followUpWatchers)
    .set({ status: "cancelled" })
    .where(eq(followUpWatchers.id, parsed.data));

  revalidatePath("/agent/follow-ups");
  return { ok: true };
}
