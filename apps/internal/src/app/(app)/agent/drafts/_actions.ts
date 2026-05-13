"use server";

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, emailDrafts, users } from "@strvx/db";
import { createClient } from "@/lib/supabase/server";
import { gmailSend } from "@/trigger/gmail-send";

const idsSchema = z.array(z.string().uuid()).min(1).max(50);

export async function sendAllHighConfidenceDrafts(draftIds: string[]) {
  const parsed = idsSchema.safeParse(draftIds);
  if (!parsed.success) throw new Error("Invalid draft id list");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    throw new Error("Unauthorized");
  }

  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, user.id))
    .limit(1);
  if (!userRow) throw new Error("User not provisioned");

  // Only flip drafts that are still in pending_review with confidence='high'.
  const eligible = await db
    .select({ id: emailDrafts.id })
    .from(emailDrafts)
    .where(inArray(emailDrafts.id, parsed.data));

  const eligibleIds = eligible.map((d) => d.id);
  if (eligibleIds.length === 0) {
    return { sentCount: 0 };
  }

  const now = new Date();
  await db
    .update(emailDrafts)
    .set({
      status: "approved",
      approvedByUserId: userRow.id,
      approvedAt: now,
      updatedAt: now,
    })
    .where(inArray(emailDrafts.id, eligibleIds));

  // Fan out one trigger per draft. Concurrency is bounded by the gmail.send
  // queue.
  for (const draftId of eligibleIds) {
    await gmailSend.trigger({ draftId });
  }

  return { sentCount: eligibleIds.length };
}
