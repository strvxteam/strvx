import { eq } from "drizzle-orm";
import type { db as DbType } from "@strvx/db";
import {
  emailMessages,
  emailThreads,
  agentClassifications,
  cosRuns,
  engagements,
  crmHygieneFlags,
} from "@strvx/db";
import { getOpenAI, MODELS } from "../openai-client";
import {
  classificationSchema,
  classificationJsonSchema,
  type Classification,
} from "./schema";
import { buildClassificationPrompt } from "./prompt";
import { detectStageAdvancementSignal } from "../stage-advancement/detect";
// TODO(slice-4): wire Sentry breadcrumb when apps/internal/src/trigger/_sentry.ts lands.

/**
 * OpenAI strict JSON-schema mode requires additionalProperties:false on every
 * object and a `required` array listing all properties. Zod 4's toJSONSchema
 * doesn't always set these on nested objects. We patch the schema before sending.
 */
export function makeStrict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(makeStrict);
  if (schema && typeof schema === "object") {
    const o = { ...(schema as Record<string, unknown>) };
    if (o.type === "object" && o.properties && typeof o.properties === "object") {
      o.additionalProperties = false;
      o.required = Object.keys(o.properties as Record<string, unknown>);
      o.properties = Object.fromEntries(
        Object.entries(o.properties as Record<string, unknown>).map(([k, v]) => [
          k,
          makeStrict(v),
        ])
      );
    }
    for (const k of Object.keys(o)) {
      if (k !== "properties" && o[k] && typeof o[k] === "object") {
        o[k] = makeStrict(o[k]);
      }
    }
    return o;
  }
  return schema;
}

const STRICT_SCHEMA = makeStrict(classificationJsonSchema);

/**
 * Cost table (USD per 1M tokens). Adjust as OpenAI pricing shifts.
 * GPT-5-mini approx: $0.25 input / $2.00 output (placeholder — verify before billing).
 */
const PRICING_PER_M = {
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5": { input: 1.25, output: 10.0 },
} as const;

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = (PRICING_PER_M as Record<string, { input: number; output: number }>)[model];
  if (!p) return 0;
  return (
    (inputTokens * p.input) / 1_000_000 + (outputTokens * p.output) / 1_000_000
  );
}

export type ClassifyMessageInput = {
  messageId: string; // our internal email_messages.id
  db: typeof DbType;
  openai?: ReturnType<typeof getOpenAI>;
};

export type ClassifyMessageResult = {
  classification: Classification;
  cosRunId: string;
  agentClassificationId: string;
};

/**
 * Runs classification for one message. Idempotent on agent_classifications.message_id
 * UNIQUE — re-running for the same message will fail at insert time; caller is
 * expected to gate on whether a classification already exists if they want to skip.
 */
export async function classifyMessage(
  input: ClassifyMessageInput
): Promise<ClassifyMessageResult> {
  const { messageId, db } = input;
  const openai = input.openai ?? getOpenAI();

  // 1. Load the message + thread context.
  const [msgRow] = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.id, messageId))
    .limit(1);
  if (!msgRow) throw new Error(`Message ${messageId} not found`);

  const [thread] = await db
    .select({
      id: emailThreads.id,
      subject: emailThreads.subject,
      messageCount: emailThreads.messageCount,
      participants: emailThreads.participants,
      mailboxId: emailThreads.mailboxId,
    })
    .from(emailThreads)
    .where(eq(emailThreads.id, msgRow.threadId))
    .limit(1);
  if (!thread) throw new Error(`Thread ${msgRow.threadId} not found`);

  // 2. Build prompt. Phase 1: empty candidateEngagements; CRM lookup wires in later.
  const { system, user } = buildClassificationPrompt({
    message: {
      gmailMessageId: msgRow.gmailMessageId,
      gmailHistoryId: msgRow.gmailHistoryId ?? undefined,
      gmailThreadId: thread.id,
      messageIdHeader: msgRow.messageIdHeader ?? undefined,
      inReplyToHeader: msgRow.inReplyToMessageId ?? undefined,
      referencesHeader: undefined,
      fromEmail: msgRow.fromEmail,
      fromName: msgRow.fromName ?? undefined,
      toEmails: msgRow.toEmails,
      ccEmails: msgRow.ccEmails,
      bccEmails: msgRow.bccEmails,
      subject: msgRow.subject ?? undefined,
      bodyText: msgRow.bodyText ?? undefined,
      bodyHtml: msgRow.bodyHtml ?? undefined,
      snippet: msgRow.snippet ?? undefined,
      direction: msgRow.direction,
      sentAt: msgRow.sentAt,
      labels: msgRow.labels,
      isUnread: msgRow.isUnread,
      isStarred: msgRow.isStarred,
      hasAttachments: msgRow.hasAttachments,
      rawSize: msgRow.rawSize ?? undefined,
      attachments: [],
    },
    threadContext: {
      priorMessageCount: Math.max(0, thread.messageCount - 1),
      threadSubject: thread.subject ?? undefined,
      participants: Array.isArray(thread.participants)
        ? (thread.participants as Array<{ email: string; name?: string; role?: string }>)
        : [],
    },
    candidateEngagements: [],
  });

  // 3. Call OpenAI Responses API with strict JSON schema.
  const startedAt = new Date();
  const model = MODELS.classify;
  let parsedClassification: Classification;
  let inputTokens = 0;
  let outputTokens = 0;
  let runStatus: "succeeded" | "failed" = "succeeded";
  let errorMessage: string | undefined;
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
          name: "Classification",
          schema: STRICT_SCHEMA as Record<string, unknown>,
          strict: true,
        },
      },
    });
    // Responses API returns output_text on the response object for simple cases
    // and a structured `output` array otherwise. Extract robustly.
    rawOutput =
      (response as { output_text?: string }).output_text ??
      extractTextFromResponse(response);

    inputTokens = (response as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0;
    outputTokens = (response as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
    parsedClassification = classificationSchema.parse(JSON.parse(rawOutput));
  } catch (err) {
    runStatus = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    // Re-throw after recording the failed cos_run.
    const completedAt = new Date();
    await db
      .insert(cosRuns)
      .values({
        kind: "classify",
        status: "failed",
        mailboxId: thread.mailboxId,
        threadId: thread.id,
        messageId: messageId,
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens).toFixed(6),
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage,
        metadata: { rawOutput },
      })
      .returning({ id: cosRuns.id });
    // TODO(slice-4): wire Sentry breadcrumb here once trigger/_sentry.ts lands.
    throw err;
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens);

  // 4. Write cos_runs + agent_classifications + denormalize in one transaction.
  const result = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(cosRuns)
      .values({
        kind: "classify",
        status: runStatus,
        mailboxId: thread.mailboxId,
        threadId: thread.id,
        messageId: messageId,
        model,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        startedAt,
        completedAt,
        durationMs,
        metadata: { rawOutput },
      })
      .returning({ id: cosRuns.id });

    const [classification] = await tx
      .insert(agentClassifications)
      .values({
        messageId: messageId,
        threadId: thread.id,
        cosRunId: run.id,
        category: parsedClassification.category,
        urgency: parsedClassification.urgency,
        intent: parsedClassification.intent,
        requiresReply: parsedClassification.requires_reply,
        suggestedWorkflow: parsedClassification.suggested_workflow,
        relatedEngagementId: parsedClassification.related_engagement_id,
        relatedEngagementConfidence:
          parsedClassification.related_engagement_confidence,
        relatedContactId: parsedClassification.related_contact_id,
        reasoning: parsedClassification.reasoning,
      })
      .returning({ id: agentClassifications.id });

    // 5. Denormalize on email_threads so list views can filter/sort cheaply.
    await tx
      .update(emailThreads)
      .set({
        agentCategory: parsedClassification.category,
        agentUrgency: parsedClassification.urgency,
        agentState: "classified",
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, thread.id));

    return {
      cosRunId: run.id,
      agentClassificationId: classification.id,
    };
  });

  // 6. Stage-advancement signal — never auto-advance, only suggest. We always
  // run this outside the classification transaction so a flag-write failure
  // can't roll back a successful classification.
  await maybeFlagStageAdvancement({
    db,
    classification: parsedClassification,
    threadId: thread.id,
  });

  return {
    classification: parsedClassification,
    cosRunId: result.cosRunId,
    agentClassificationId: result.agentClassificationId,
  };
}

/**
 * Looks up the related engagement's current stage and, if the heuristic
 * fires, sets requires_human on the thread + inserts a hygiene flag of
 * kind='stage_advancement_suggested'. Idempotent via the table's UNIQUE
 * (kind, entity_kind, entity_id, related_entity_id). Silently no-ops when
 * the classification didn't link an engagement.
 */
async function maybeFlagStageAdvancement(args: {
  db: typeof DbType;
  classification: Classification;
  threadId: string;
}): Promise<void> {
  const { db, classification, threadId } = args;
  const engagementId = classification.related_engagement_id;
  if (!engagementId) return;

  const [engagement] = await db
    .select({ id: engagements.id, stage: engagements.stage })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) return;

  const signal = detectStageAdvancementSignal({
    classification,
    threadCategory: classification.category,
    currentStage: engagement.stage,
    threadId,
    engagementId,
  });
  if (!signal.shouldFlag || !signal.suggestedStage) return;

  await db
    .update(emailThreads)
    .set({ requiresHuman: true, updatedAt: new Date() })
    .where(eq(emailThreads.id, threadId));

  await db
    .insert(crmHygieneFlags)
    .values({
      kind: "stage_advancement_suggested",
      entityKind: "engagement",
      entityId: engagementId,
      relatedEntityId: threadId,
      status: "open",
      details: {
        from_stage: engagement.stage,
        to_stage: signal.suggestedStage,
        signals: signal.signals,
      },
    })
    .onConflictDoNothing();
}

/** Walk a Responses API response and concatenate any text output items. */
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
