import type { db as DbType } from "@strvx/db";
import { cosRuns, dailyBriefs } from "@strvx/db";
import { estimateCostUsd } from "../classify/classify";
import { getOpenAI, MODELS } from "../openai-client";
import { assembleBriefInputs, todayInPT } from "./inputs";
import { buildBriefPrompt } from "./prompt";
// TODO(slice-4): wire Sentry breadcrumb when apps/internal/src/trigger/_sentry.ts lands.

export type GenerateDailyBriefInput = {
  db: typeof DbType;
  openai?: ReturnType<typeof getOpenAI>;
  /** Allows tests / on-demand triggers to pin a clock. Defaults to `new Date()`. */
  now?: Date;
};

export type GenerateDailyBriefResult = {
  briefId: string;
  cosRunId: string;
  date: string;
  contentMarkdown: string;
};

/**
 * End-to-end brief generation:
 *   1. SQL → BriefInputs
 *   2. One GPT-5 Responses-API call (markdown text, not JSON)
 *   3. cos_runs row (kind=brief) with token/cost/duration accounting
 *   4. daily_briefs upsert keyed on date (PT) — re-running the same day overwrites
 *      and links to the fresh cos_run
 */
export async function generateDailyBrief(
  input: GenerateDailyBriefInput
): Promise<GenerateDailyBriefResult> {
  const { db } = input;
  const openai = input.openai ?? getOpenAI();
  const now = input.now ?? new Date();
  const date = todayInPT(now);

  const inputs = await assembleBriefInputs({ db, now });
  const { system, user } = buildBriefPrompt(inputs);

  const startedAt = new Date();
  const model = MODELS.brief;
  let contentMarkdown = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let runStatus: "succeeded" | "failed" = "succeeded";
  let errorMessage: string | undefined;

  try {
    const response = await openai.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    contentMarkdown =
      (response as { output_text?: string }).output_text ??
      extractTextFromResponse(response);
    inputTokens =
      (response as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0;
    outputTokens =
      (response as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;

    if (!contentMarkdown.trim()) {
      throw new Error("Brief model returned empty content");
    }
  } catch (err) {
    runStatus = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    const completedAt = new Date();
    await db
      .insert(cosRuns)
      .values({
        kind: "brief",
        status: "failed",
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens).toFixed(6),
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage,
        metadata: { date },
      })
      .returning({ id: cosRuns.id });
    // TODO(slice-4): wire Sentry breadcrumb here once trigger/_sentry.ts lands.
    throw err;
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens);

  const result = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(cosRuns)
      .values({
        kind: "brief",
        status: runStatus,
        model,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        startedAt,
        completedAt,
        durationMs,
        metadata: { date },
      })
      .returning({ id: cosRuns.id });

    const [brief] = await tx
      .insert(dailyBriefs)
      .values({
        date,
        contentMarkdown,
        cosRunId: run.id,
        generatedAt: completedAt,
      })
      .onConflictDoUpdate({
        target: dailyBriefs.date,
        set: {
          contentMarkdown,
          cosRunId: run.id,
          generatedAt: completedAt,
          dismissedAt: null,
        },
      })
      .returning({ id: dailyBriefs.id });

    return { cosRunId: run.id, briefId: brief.id };
  });

  return {
    briefId: result.briefId,
    cosRunId: result.cosRunId,
    date,
    contentMarkdown,
  };
}

/** Walk a Responses API output array and concatenate any text items. */
function extractTextFromResponse(response: unknown): string {
  const r = response as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  let out = "";
  for (const item of r.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") {
        out += c.text;
      }
    }
  }
  return out;
}
