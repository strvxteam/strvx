import { eq, like } from "drizzle-orm";
import { z } from "zod";
import type { db as DbType } from "@strvx/db";
import {
  cosRuns,
  engagements,
  contacts,
  nextActions,
  users,
} from "@strvx/db";
import { estimateCostUsd, makeStrict } from "../classify/classify";
import { getOpenAI, MODELS } from "../openai-client";
import { recordCosRunFailedBreadcrumb } from "@/trigger/_sentry";

export const extractedActionSchema = z.object({
  description: z.string().min(1).max(500),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "due_date must be YYYY-MM-DD")
    .nullable(),
  priority: z.enum(["low", "normal", "high"]).nullable(),
});

export const extractedActionsResponseSchema = z.object({
  actions: z.array(extractedActionSchema).max(20),
});

export type ExtractedAction = z.infer<typeof extractedActionSchema>;
export type ExtractedActionsResponse = z.infer<
  typeof extractedActionsResponseSchema
>;

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          due_date: { type: ["string", "null"] },
          priority: { type: ["string", "null"], enum: ["low", "normal", "high", null] },
        },
      },
    },
  },
} as const;

const STRICT_RESPONSE_SCHEMA = makeStrict(RESPONSE_JSON_SCHEMA);

export type ExtractActionsInput = {
  db: typeof DbType;
  openai?: ReturnType<typeof getOpenAI>;
  engagementId: string;
  /** Concatenated meeting notes (or a single note) to mine for action items. */
  notesText: string;
  /** Optional mailbox to record on `cos_runs` for traceability. */
  mailboxId?: string | null;
  /** Optional calendar event id to record in metadata. */
  calendarEventId?: string | null;
};

export type ExtractActionsResult = {
  cosRunId: string;
  insertedActionIds: string[];
  actions: ExtractedAction[];
};

/**
 * Mine a chunk of meeting notes for follow-up action items. One GPT-5-mini
 * Responses API call with strict JSON. Writes a `cos_runs` row (kind =
 * `extract_actions`) and one `next_actions` row per extracted item, all
 * with `created_by_agent = true`.
 *
 * Owner resolution:
 *   1. If the engagement's primary contact resolves to a `users` row (by
 *      email match), use that user.
 *   2. Otherwise, fall back to the first @strvx.com user.
 *   3. If neither exists, throw — next_actions.owner_id is NOT NULL.
 *
 * Returns `{ insertedActionIds: [] }` and skips the LLM call when notesText
 * is empty / whitespace.
 */
export async function extractActionsFromNotes(
  input: ExtractActionsInput
): Promise<ExtractActionsResult> {
  const { db, engagementId, notesText } = input;
  const openai = input.openai ?? getOpenAI();

  if (!notesText || !notesText.trim()) {
    return { cosRunId: "", insertedActionIds: [], actions: [] };
  }

  const ownerId = await resolveOwnerId(db, engagementId);
  if (!ownerId) {
    throw new Error(
      `extractActionsFromNotes: no eligible owner for engagement ${engagementId}`
    );
  }

  const startedAt = new Date();
  const model = MODELS.capture;

  const system = [
    "You are the strvx chief-of-staff agent extracting follow-up action items from meeting notes.",
    "Return strict JSON matching the provided schema.",
    "Only include concrete, owned action items — not summaries or background.",
    "If no actionable items exist, return an empty actions array.",
    "Each description: <= 200 chars, imperative voice, no leading dashes.",
    "Priority guidance: 'high' for blockers/deadlines this week; 'normal' default; 'low' for nice-to-haves.",
    "due_date: YYYY-MM-DD only if explicitly stated or strongly implied; otherwise null.",
  ].join("\n");

  const user = [
    "MEETING NOTES:",
    "```",
    notesText.slice(0, 12000),
    "```",
    "",
    "Extract the action items.",
  ].join("\n");

  let parsed: ExtractedActionsResponse;
  let inputTokens = 0;
  let outputTokens = 0;
  let rawOutput = "";

  try {
    const response = await openai.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ExtractedActions",
          schema: STRICT_RESPONSE_SCHEMA as Record<string, unknown>,
          strict: true,
        },
      },
    });
    rawOutput =
      (response as { output_text?: string }).output_text ??
      extractTextFromResponse(response);
    inputTokens =
      (response as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0;
    outputTokens =
      (response as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
    parsed = extractedActionsResponseSchema.parse(JSON.parse(rawOutput));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const completedAt = new Date();
    const [failedRun] = await db
      .insert(cosRuns)
      .values({
        kind: "extract_actions",
        status: "failed",
        mailboxId: input.mailboxId ?? null,
        engagementId,
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens).toFixed(6),
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage,
        metadata: {
          calendarEventId: input.calendarEventId ?? null,
          rawOutput,
        },
      })
      .returning({ id: cosRuns.id });
    recordCosRunFailedBreadcrumb({
      taskId: "agent.follow-up.extract-actions",
      cosRunId: failedRun.id,
      mailboxId: input.mailboxId ?? undefined,
      reason: errorMessage,
    });
    throw err;
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens);

  const { cosRunId, insertedActionIds } = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(cosRuns)
      .values({
        kind: "extract_actions",
        status: "succeeded",
        mailboxId: input.mailboxId ?? null,
        engagementId,
        model,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        startedAt,
        completedAt,
        durationMs,
        metadata: {
          calendarEventId: input.calendarEventId ?? null,
          actionCount: parsed.actions.length,
        },
      })
      .returning({ id: cosRuns.id });

    const ids: string[] = [];
    for (const a of parsed.actions) {
      const [row] = await tx
        .insert(nextActions)
        .values({
          engagementId,
          ownerId,
          description: a.description,
          priority: a.priority ?? "normal",
          dueDate: a.due_date ?? null,
          createdByAgent: true,
        })
        .returning({ id: nextActions.id });
      if (row) ids.push(row.id);
    }

    return { cosRunId: run.id, insertedActionIds: ids };
  });

  return { cosRunId, insertedActionIds, actions: parsed.actions };
}

async function resolveOwnerId(
  db: typeof DbType,
  engagementId: string
): Promise<string | null> {
  const [eng] = await db
    .select({
      primaryContactId: engagements.primaryContactId,
    })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);

  if (eng?.primaryContactId) {
    const [contact] = await db
      .select({ email: contacts.email })
      .from(contacts)
      .where(eq(contacts.id, eng.primaryContactId))
      .limit(1);
    if (contact?.email) {
      const [matchedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, contact.email.toLowerCase()))
        .limit(1);
      if (matchedUser) return matchedUser.id;
    }
  }

  // Fallback: first @strvx.com user.
  const [strvxUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, "%@strvx.com"))
    .limit(1);
  if (strvxUser) return strvxUser.id;

  // Last resort: any user.
  const [anyUser] = await db
    .select({ id: users.id })
    .from(users)
    .limit(1);
  return anyUser?.id ?? null;
}

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
