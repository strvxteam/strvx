"use server";

import { createClient } from "@/lib/supabase/server";
import { dailyBriefGenerateNow } from "@/trigger/daily-brief-generate";

/**
 * Fires the on-demand brief task for today (PT). Returns the trigger run id
 * so the UI can show that generation has started.
 */
export async function triggerBriefNow(): Promise<{ runId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    throw new Error("Unauthorized");
  }

  const handle = await dailyBriefGenerateNow.trigger();
  return { runId: handle.id };
}
