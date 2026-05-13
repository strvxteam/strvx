"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, agentSettings, users } from "@strvx/db";
import { createClient } from "@/lib/supabase/server";
import {
  toggleVoiceSampleImpl,
  type VoiceSampleDeps,
} from "./_voice-samples-impl";

const HOUR = z.number().int().min(0).max(23);
const WORKING_DAY = z.number().int().min(0).max(6);

export const agentSettingsInputSchema = z
  .object({
    mailboxId: z.string().uuid(),
    workingStartHour: HOUR,
    workingEndHour: HOUR,
    workingDays: z.array(WORKING_DAY).min(1).max(7),
    bufferMinutes: z.number().int().min(0).max(120),
    maxBackToBack: z.number().int().min(1).max(10),
    timezone: z.string().min(1).max(64),
  })
  .refine((v) => v.workingEndHour > v.workingStartHour, {
    message: "workingEndHour must be greater than workingStartHour",
    path: ["workingEndHour"],
  });

export type AgentSettingsInput = z.infer<typeof agentSettingsInputSchema>;

export type SaveAgentSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Upsert one mailbox's agent_settings row. Admin-only — re-checks the
 * @strvx.com gate (layout already does this for the page, but server actions
 * are reachable independently).
 */
export async function saveAgentSettings(
  input: AgentSettingsInput
): Promise<SaveAgentSettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = agentSettingsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const v = parsed.data;

  // Deduplicate + sort working days for stability in the DB.
  const days = Array.from(new Set(v.workingDays)).sort((a, b) => a - b);

  await db
    .insert(agentSettings)
    .values({
      mailboxId: v.mailboxId,
      workingStartHour: v.workingStartHour,
      workingEndHour: v.workingEndHour,
      workingDays: days,
      bufferMinutes: v.bufferMinutes,
      maxBackToBack: v.maxBackToBack,
      timezone: v.timezone,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: agentSettings.mailboxId,
      set: {
        workingStartHour: v.workingStartHour,
        workingEndHour: v.workingEndHour,
        workingDays: days,
        bufferMinutes: v.bufferMinutes,
        maxBackToBack: v.maxBackToBack,
        timezone: v.timezone,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/agent/settings");
  return { ok: true };
}

/**
 * Auth-gate the caller and resolve their internal users.id.
 */
async function authedStrvxUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, user.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Toggle whether a sent message is curated as a voice-sample anchor for
 * the planner. Auth-gated to @strvx.com. Idempotent on re-star; deletes
 * the row on un-star.
 */
export async function toggleVoiceSample(
  messageId: string,
  starred: boolean
): Promise<{ ok: true; starred: boolean }> {
  const out = await toggleVoiceSampleImpl(messageId, starred, {
    getCallerUserId: authedStrvxUserId,
  });
  revalidatePath("/agent/settings");
  return out;
}

// Re-export the dep type so consumers (tests) can import from one place
// without reaching into the impl file directly.
export type { VoiceSampleDeps };
