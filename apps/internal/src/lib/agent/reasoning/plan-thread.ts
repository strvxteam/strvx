import { and, desc, eq } from "drizzle-orm";
import {
  db,
  emailThreads,
  emailMessages,
  agentClassifications,
  cosRuns,
  agentVoiceSamples,
} from "@strvx/db";
import { getOpenAI, MODELS } from "../openai-client";
import {
  buildOpenAIToolList,
  findTool,
} from "../tools/registry";
import type { ToolContext } from "../tools/types";
import { PLANNER_SYSTEM_PROMPT } from "./system-prompt";
import { recordCosRunFailedBreadcrumb } from "@/trigger/_sentry";

const MAX_ITERATIONS = 8;

/**
 * Pricing (USD per 1M tokens). Same table as classify.ts — duplicate for now;
 * de-dupe when we add more models / Phase 3+.
 */
const PRICING_PER_M: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5": { input: 1.25, output: 10.0 },
};

function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING_PER_M[model];
  if (!p) return 0;
  return (
    (inputTokens * p.input) / 1_000_000 +
    (outputTokens * p.output) / 1_000_000
  );
}

export type SeedIntent =
  | "stale_followup"
  | "no_show_followup"
  | "booking_confirmation";

export type PlanThreadInput = {
  threadId: string;
  /**
   * Optional hint for cron-spawned follow-up runs. When set, a single extra
   * user message is appended to the kickoff conversation telling the planner
   * what kind of draft to produce, and the value is persisted into
   * `cos_runs.metadata.seedIntent` for traceability.
   */
  seedIntent?: SeedIntent;
};

export type PlanThreadResult = {
  cosRunId: string;
  terminalTool?: string;
  terminalReason?: string;
  iterations: number;
  toolCalls: number;
  totalCostUsd: number;
};

type ConversationItem =
  | { role: "user" | "system" | "assistant" | "developer"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

/**
 * Run the planner loop for one thread.
 *
 * Flow:
 *   1. Load thread + classification + first 50 messages.
 *   2. Write a `cos_runs` row with status='running'.
 *   3. Loop up to MAX_ITERATIONS:
 *        - Call OpenAI Responses API with the conversation + ALL_TOOLS.
 *        - For each tool call in the response: look up handler, validate input
 *          with Zod, run handler, append tool_result to the conversation.
 *        - If a terminal tool fired: break out of the loop.
 *        - Otherwise: continue.
 *   4. If the loop exits without a terminal tool, force-escalate.
 *   5. Update `cos_runs` row with final status, tokens, cost, duration.
 */
export async function planThread(
  input: PlanThreadInput
): Promise<PlanThreadResult> {
  const openai = getOpenAI();

  // 1. Load thread + classification.
  const [thread] = await db
    .select({
      id: emailThreads.id,
      mailboxId: emailThreads.mailboxId,
      subject: emailThreads.subject,
      participants: emailThreads.participants,
      agentCategory: emailThreads.agentCategory,
      agentUrgency: emailThreads.agentUrgency,
      engagementId: emailThreads.engagementId,
      messageCount: emailThreads.messageCount,
    })
    .from(emailThreads)
    .where(eq(emailThreads.id, input.threadId))
    .limit(1);
  if (!thread) throw new Error(`Thread ${input.threadId} not found`);

  const messages = await db
    .select({
      id: emailMessages.id,
      fromEmail: emailMessages.fromEmail,
      fromName: emailMessages.fromName,
      toEmails: emailMessages.toEmails,
      ccEmails: emailMessages.ccEmails,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      direction: emailMessages.direction,
      sentAt: emailMessages.sentAt,
    })
    .from(emailMessages)
    .where(eq(emailMessages.threadId, input.threadId))
    .orderBy(emailMessages.sentAt)
    .limit(50);

  // Latest classification for context.
  const [latestClassification] = await db
    .select({
      category: agentClassifications.category,
      urgency: agentClassifications.urgency,
      intent: agentClassifications.intent,
      requiresReply: agentClassifications.requiresReply,
      suggestedWorkflow: agentClassifications.suggestedWorkflow,
      reasoning: agentClassifications.reasoning,
    })
    .from(agentClassifications)
    .where(eq(agentClassifications.threadId, input.threadId))
    .orderBy(agentClassifications.createdAt)
    .limit(1);

  // 2. Open cos_runs row.
  const startedAt = new Date();
  const model = MODELS.reasoning;
  const initialMetadata: Record<string, unknown> = {
    toolCalls: [],
    iterations: 0,
  };
  if (input.seedIntent) {
    initialMetadata.seedIntent = input.seedIntent;
  }
  const [run] = await db
    .insert(cosRuns)
    .values({
      kind: "plan",
      status: "running",
      mailboxId: thread.mailboxId,
      threadId: thread.id,
      model,
      startedAt,
      metadata: initialMetadata,
    })
    .returning({ id: cosRuns.id });

  const ctx: ToolContext = {
    db,
    mailboxId: thread.mailboxId,
    threadId: thread.id,
    cosRunId: run.id,
  };

  // 3. Build the initial conversation. Cache-friendly: stable prefix first.
  const userKickoff = buildUserKickoff({
    thread,
    messages,
    classification: latestClassification ?? null,
  });

  // Stable-snapshot tier: voice samples for this mailbox. Loaded before the
  // per-thread variable content so OpenAI's automatic prefix caching can hit
  // across runs for the same mailbox. Up to 10 starred samples, truncated.
  const voiceSamplesBlock = await loadVoiceSamplesBlock(thread.mailboxId);

  const conversation: ConversationItem[] = [
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    ...(voiceSamplesBlock
      ? [{ role: "system" as const, content: voiceSamplesBlock }]
      : []),
    { role: "user", content: userKickoff },
  ];

  if (input.seedIntent) {
    conversation.push({
      role: "user",
      content: `Context: this run is a ${input.seedIntent} follow-up. Draft an appropriate message via propose_draft, then terminate with done.`,
    });
  }

  const toolDefs = buildOpenAIToolList();

  let iterations = 0;
  let toolCallCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolCallLog: Array<{
    name: string;
    input: unknown;
    output: unknown;
    error?: string;
  }> = [];
  let runStatus: "succeeded" | "failed" | "partial" = "succeeded";
  let lastError: string | undefined;

  while (iterations < MAX_ITERATIONS && !ctx.terminalCalled) {
    iterations++;

    let response;
    try {
      response = await openai.responses.create({
        model,
        input: conversation as unknown as Parameters<
          typeof openai.responses.create
        >[0]["input"],
        tools: toolDefs as unknown as Parameters<
          typeof openai.responses.create
        >[0]["tools"],
        parallel_tool_calls: true,
        reasoning: { effort: "low" },
      });
    } catch (err) {
      runStatus = "failed";
      lastError = err instanceof Error ? err.message : String(err);
      break;
    }

    totalInputTokens +=
      (response as { usage?: { input_tokens?: number } }).usage
        ?.input_tokens ?? 0;
    totalOutputTokens +=
      (response as { usage?: { output_tokens?: number } }).usage
        ?.output_tokens ?? 0;

    const outputItems = (
      response as unknown as { output?: Array<Record<string, unknown>> }
    ).output ?? [];

    // Gather all tool_calls in this response turn.
    const toolCalls = outputItems.filter(
      (it) => (it as { type?: string }).type === "function_call"
    ) as Array<{
      type: "function_call";
      id?: string;
      call_id: string;
      name: string;
      arguments: string;
    }>;

    if (toolCalls.length === 0) {
      // Model went silent without a tool call. Nudge once.
      conversation.push({
        role: "user",
        content:
          "You must call a tool. Either gather more context with a read tool, propose a draft, or terminate with done/escalate_to_human/no_action.",
      });
      // Push the assistant's text output back into the conversation for continuity.
      for (const it of outputItems) {
        if ((it as { type?: string }).type === "message") {
          conversation.push(it as unknown as ConversationItem);
        }
      }
      continue;
    }

    // Append the assistant's tool_call items to the conversation so the
    // model can see its own prior calls.
    for (const tc of toolCalls) {
      conversation.push({
        type: "function_call",
        call_id: tc.call_id,
        name: tc.name,
        arguments: tc.arguments,
      });
    }

    // Execute each tool call. Stop executing after a terminal tool fires.
    for (const tc of toolCalls) {
      if (ctx.terminalCalled) break;

      toolCallCount++;
      const tool = findTool(tc.name);
      if (!tool) {
        const errorPayload = { error: `unknown_tool: ${tc.name}` };
        toolCallLog.push({
          name: tc.name,
          input: tc.arguments,
          output: errorPayload,
          error: "unknown_tool",
        });
        conversation.push({
          type: "function_call_output",
          call_id: tc.call_id,
          output: JSON.stringify(errorPayload),
        });
        continue;
      }

      let parsedInput: unknown;
      try {
        parsedInput = tool.inputSchema.parse(JSON.parse(tc.arguments));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorPayload = { error: "invalid_input", details: message };
        toolCallLog.push({
          name: tc.name,
          input: tc.arguments,
          output: errorPayload,
          error: "invalid_input",
        });
        conversation.push({
          type: "function_call_output",
          call_id: tc.call_id,
          output: JSON.stringify(errorPayload),
        });
        continue;
      }

      try {
        const result = await tool.handle(parsedInput, ctx);
        toolCallLog.push({ name: tc.name, input: parsedInput, output: result });
        conversation.push({
          type: "function_call_output",
          call_id: tc.call_id,
          output: JSON.stringify(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolCallLog.push({
          name: tc.name,
          input: parsedInput,
          output: { error: message },
          error: message,
        });
        conversation.push({
          type: "function_call_output",
          call_id: tc.call_id,
          output: JSON.stringify({ error: message }),
        });
      }
    }
  }

  // 4. If we exited the loop without a terminal tool, force-escalate.
  let terminalTool: string | undefined;
  let terminalReason: string | undefined;

  if (!ctx.terminalCalled) {
    terminalTool = "escalate_to_human";
    terminalReason = `Loop budget exhausted after ${iterations} iterations`;
    try {
      const escalate = findTool("escalate_to_human");
      if (escalate) {
        await escalate.handle(
          { thread_id: thread.id, reason: terminalReason } as unknown as never,
          ctx
        );
      }
      runStatus = "partial";
    } catch {
      runStatus = "failed";
    }
  } else {
    terminalTool = ctx.terminalReason ? ctx.terminalReason.split(":")[0] : "terminal";
    terminalReason = ctx.terminalReason;
  }

  // 5. Close out cos_runs.
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const costUsd = estimateCostUsd(model, totalInputTokens, totalOutputTokens);

  await db
    .update(cosRuns)
    .set({
      status: runStatus,
      completedAt,
      durationMs,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: costUsd.toFixed(6),
      errorMessage: lastError,
      metadata: {
        iterations,
        toolCalls: toolCallLog,
        terminalTool,
        terminalReason,
        ...(input.seedIntent ? { seedIntent: input.seedIntent } : {}),
      },
    })
    .where(eq(cosRuns.id, run.id));

  if (runStatus === "failed" || runStatus === "partial") {
    try {
      recordCosRunFailedBreadcrumb({
        taskId: "lib.plan_thread",
        cosRunId: run.id,
        mailboxId: thread.mailboxId,
        threadId: thread.id,
        reason: lastError ?? `runStatus=${runStatus}`,
      });
    } catch {
      // Never let Sentry instrumentation crash the flow.
    }
  }

  return {
    cosRunId: run.id,
    terminalTool,
    terminalReason,
    iterations,
    toolCalls: toolCallCount,
    totalCostUsd: costUsd,
  };
}

/**
 * Build the kickoff user message. Inlines thread + messages + classification
 * so the model gets everything it needs without an extra read_thread tool call.
 */
function buildUserKickoff({
  thread,
  messages,
  classification,
}: {
  thread: {
    id: string;
    subject: string | null;
    participants: unknown;
    agentCategory: string | null;
    agentUrgency: string | null;
    engagementId: string | null;
    messageCount: number;
  };
  messages: Array<{
    fromEmail: string;
    fromName: string | null;
    toEmails: string[];
    ccEmails: string[];
    direction: string;
    subject: string | null;
    bodyText: string | null;
    sentAt: Date;
  }>;
  classification: {
    category: string;
    urgency: string;
    intent: string;
    requiresReply: boolean;
    suggestedWorkflow: string | null;
    reasoning: string | null;
  } | null;
}): string {
  const parts: string[] = [];

  parts.push(`THREAD ID: ${thread.id}`);
  if (thread.engagementId) parts.push(`LINKED ENGAGEMENT ID: ${thread.engagementId}`);
  parts.push(`SUBJECT: ${thread.subject ?? "(none)"}`);
  parts.push(`MESSAGE COUNT: ${thread.messageCount}`);
  parts.push("");

  if (classification) {
    parts.push("CLASSIFICATION:");
    parts.push(`  category: ${classification.category}`);
    parts.push(`  urgency: ${classification.urgency}`);
    parts.push(`  intent: ${classification.intent}`);
    parts.push(`  requires_reply: ${classification.requiresReply}`);
    if (classification.suggestedWorkflow) {
      parts.push(`  suggested_workflow: ${classification.suggestedWorkflow}`);
    }
    if (classification.reasoning) {
      parts.push(`  reasoning: ${classification.reasoning}`);
    }
    parts.push("");
  }

  parts.push("MESSAGES (chronological):");
  for (const m of messages) {
    parts.push("---");
    parts.push(
      `[${m.direction}] ${m.fromName ?? m.fromEmail} → ${m.toEmails.join(", ")} (${m.sentAt.toISOString()})`
    );
    if (m.subject) parts.push(`Subject: ${m.subject}`);
    if (m.bodyText) {
      const body =
        m.bodyText.length > 4000
          ? m.bodyText.slice(0, 4000) + "\n[truncated]"
          : m.bodyText;
      parts.push("");
      parts.push(body);
    }
  }

  parts.push("");
  parts.push(
    "Plan and act. Remember to end with done / escalate_to_human / no_action."
  );
  return parts.join("\n");
}

const VOICE_SAMPLE_LIMIT = 10;
const VOICE_SAMPLE_CHAR_BUDGET = 400;

/**
 * Build the "Voice samples" stable-snapshot prompt block for a mailbox.
 * Loads the most recent starred samples (DESC by created_at), strips HTML,
 * truncates each body to 400 chars, and returns a single formatted string.
 * Returns null when the mailbox has no curated samples.
 */
export async function loadVoiceSamplesBlock(
  mailboxId: string
): Promise<string | null> {
  const rows = await db
    .select({
      sampleCreatedAt: agentVoiceSamples.createdAt,
      messageId: emailMessages.id,
      subject: emailMessages.subject,
      sentAt: emailMessages.sentAt,
      toEmails: emailMessages.toEmails,
      bodyText: emailMessages.bodyText,
      bodyHtml: emailMessages.bodyHtml,
      note: agentVoiceSamples.note,
    })
    .from(agentVoiceSamples)
    .innerJoin(
      emailMessages,
      eq(emailMessages.id, agentVoiceSamples.emailMessageId)
    )
    .where(
      and(
        eq(agentVoiceSamples.mailboxId, mailboxId),
        eq(agentVoiceSamples.starred, true)
      )
    )
    .orderBy(desc(agentVoiceSamples.createdAt))
    .limit(VOICE_SAMPLE_LIMIT);

  if (rows.length === 0) return null;

  const formatted: string[] = [
    "Voice samples (canonical outbound to match tone):",
    "",
  ];
  rows.forEach((r, i) => {
    const body = stripHtmlToText(r.bodyText, r.bodyHtml);
    const truncated =
      body.length > VOICE_SAMPLE_CHAR_BUDGET
        ? body.slice(0, VOICE_SAMPLE_CHAR_BUDGET).trimEnd() + "…"
        : body;
    formatted.push(`--- Sample ${i + 1} ---`);
    formatted.push(`Subject: ${r.subject ?? "(no subject)"}`);
    if (r.toEmails && r.toEmails.length > 0) {
      formatted.push(`To: ${r.toEmails.join(", ")}`);
    }
    if (r.note) {
      formatted.push(`Note: ${r.note}`);
    }
    formatted.push("");
    formatted.push(truncated);
    formatted.push("");
  });
  return formatted.join("\n");
}

function stripHtmlToText(
  bodyText: string | null,
  bodyHtml: string | null
): string {
  // Prefer plain text when available (gmail-send stores both).
  if (bodyText && bodyText.trim()) return bodyText.trim();
  if (!bodyHtml) return "";
  return bodyHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
