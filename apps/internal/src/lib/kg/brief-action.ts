"use server";

import { generateBrief } from "./brief";

export async function generateBriefAction(
  entityId: string,
): Promise<{ ok: true; brief: string } | { ok: false; error: string }> {
  try {
    const brief = await generateBrief(entityId);
    return { ok: true, brief };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
