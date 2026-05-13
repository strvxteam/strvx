import { and, desc, eq, isNull } from "drizzle-orm";
import type { db as DbType } from "@strvx/db";
import {
  cosRuns,
  companies,
  contacts,
  engagements,
  interactions,
  meetingPrepBriefs,
  nextActions,
} from "@strvx/db";
import { estimateCostUsd } from "../classify/classify";
import { getOpenAI, MODELS } from "../openai-client";
import type { PrepEvent } from "./select-events";
import { recordCosRunFailedBreadcrumb } from "@/trigger/_sentry";

export type GeneratePrepBriefInput = {
  db: typeof DbType;
  openai?: ReturnType<typeof getOpenAI>;
  /** The Google Calendar event we're prepping for. `id` is required. */
  event: PrepEvent;
  /** Resolved engagement, if the attendees matched one. */
  engagementId: string | null;
  /** The mailbox the event came from — recorded on cos_runs for traceability. */
  mailboxId: string;
  /** "strvx.com" — used for internal/external attendee labelling in the prompt. */
  ourDomain: string;
};

export type GeneratePrepBriefResult = {
  briefId: string;
  cosRunId: string;
  contentMarkdown: string;
};

/**
 * Generate a single meeting prep brief end-to-end:
 *   1. (optional) load engagement context if `engagementId` is set
 *   2. One GPT-5 Responses API call producing markdown
 *   3. Write paired `cos_runs` (kind=prep_brief) + `meeting_prep_briefs` rows
 *      inside a transaction. Keyed on `calendar_event_id` (UNIQUE) so re-runs
 *      for the same Google event id idempotently overwrite the prior brief.
 *
 * Errors during the model call still write a `cos_runs` row with
 * status=failed and rethrow so the caller can decide whether to skip and
 * continue (the cron does — one bad meeting shouldn't sink the batch).
 */
export async function generatePrepBriefForEvent(
  input: GeneratePrepBriefInput
): Promise<GeneratePrepBriefResult> {
  const { db, event, engagementId, mailboxId, ourDomain } = input;
  const openai = input.openai ?? getOpenAI();
  const calendarEventId = event.id;
  if (!calendarEventId) {
    throw new Error("generatePrepBriefForEvent: event.id is required");
  }

  const context = engagementId
    ? await loadEngagementContext(db, engagementId)
    : null;

  const { system, user } = buildPrepBriefPrompt({
    event,
    context,
    ourDomain,
  });

  const startedAt = new Date();
  const model = MODELS.brief;
  let contentMarkdown = "";
  let inputTokens = 0;
  let outputTokens = 0;

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
      throw new Error("Prep-brief model returned empty content");
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const completedAt = new Date();
    const [failedRun] = await db
      .insert(cosRuns)
      .values({
        kind: "prep_brief",
        status: "failed",
        mailboxId,
        engagementId: engagementId ?? null,
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens).toFixed(6),
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage,
        metadata: { calendarEventId },
      })
      .returning({ id: cosRuns.id });
    recordCosRunFailedBreadcrumb({
      taskId: "agent.prep-brief.generate",
      cosRunId: failedRun.id,
      mailboxId,
      reason: errorMessage,
    });
    throw err;
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens);

  const { briefId, cosRunId } = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(cosRuns)
      .values({
        kind: "prep_brief",
        status: "succeeded",
        mailboxId,
        engagementId: engagementId ?? null,
        model,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        startedAt,
        completedAt,
        durationMs,
        metadata: { calendarEventId },
      })
      .returning({ id: cosRuns.id });

    const [brief] = await tx
      .insert(meetingPrepBriefs)
      .values({
        calendarEventId,
        engagementId: engagementId ?? null,
        contentMarkdown,
        cosRunId: run.id,
        generatedAt: completedAt,
      })
      .onConflictDoUpdate({
        target: meetingPrepBriefs.calendarEventId,
        set: {
          contentMarkdown,
          engagementId: engagementId ?? null,
          cosRunId: run.id,
          generatedAt: completedAt,
        },
      })
      .returning({ id: meetingPrepBriefs.id });

    return { briefId: brief.id, cosRunId: run.id };
  });

  return { briefId, cosRunId, contentMarkdown };
}

// ---------------------------------------------------------------------------
// Engagement context lookup
// ---------------------------------------------------------------------------

export type EngagementContext = {
  engagement: {
    id: string;
    name: string;
    stage: string;
    dealValue: string | null;
    expectedCloseDate: string | null;
    tags: string[] | null;
  };
  company: { id: string; name: string; industry: string | null } | null;
  contact: { id: string; name: string; email: string | null; role: string | null } | null;
  recentInteractions: Array<{
    type: string;
    content: string;
    createdAt: string;
  }>;
  openNextActions: Array<{
    description: string;
    priority: string;
    dueDate: string | null;
  }>;
};

async function loadEngagementContext(
  db: typeof DbType,
  engagementId: string
): Promise<EngagementContext | null> {
  const [engagement] = await db
    .select({
      id: engagements.id,
      name: engagements.name,
      stage: engagements.stage,
      dealValue: engagements.dealValue,
      expectedCloseDate: engagements.expectedCloseDate,
      tags: engagements.tags,
      companyId: engagements.companyId,
      primaryContactId: engagements.primaryContactId,
    })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) return null;

  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      industry: companies.industry,
    })
    .from(companies)
    .where(eq(companies.id, engagement.companyId))
    .limit(1);

  let contact: EngagementContext["contact"] = null;
  if (engagement.primaryContactId) {
    const [c] = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        role: contacts.role,
      })
      .from(contacts)
      .where(eq(contacts.id, engagement.primaryContactId))
      .limit(1);
    contact = c ?? null;
  }

  const recent = await db
    .select({
      type: interactions.type,
      content: interactions.content,
      createdAt: interactions.createdAt,
    })
    .from(interactions)
    .where(eq(interactions.engagementId, engagementId))
    .orderBy(desc(interactions.createdAt))
    .limit(5);

  const openActions = await db
    .select({
      description: nextActions.description,
      priority: nextActions.priority,
      dueDate: nextActions.dueDate,
    })
    .from(nextActions)
    .where(
      and(
        eq(nextActions.engagementId, engagementId),
        eq(nextActions.completed, false),
        isNull(nextActions.archivedAt)
      )
    )
    .orderBy(nextActions.dueDate)
    .limit(10);

  return {
    engagement: {
      id: engagement.id,
      name: engagement.name,
      stage: engagement.stage,
      dealValue: engagement.dealValue,
      expectedCloseDate: engagement.expectedCloseDate,
      tags: engagement.tags,
    },
    company: company ?? null,
    contact,
    recentInteractions: recent.map((r) => ({
      type: r.type,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
    openNextActions: openActions.map((a) => ({
      description: a.description,
      priority: a.priority,
      dueDate: a.dueDate,
    })),
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

type PromptArgs = {
  event: PrepEvent;
  context: EngagementContext | null;
  ourDomain: string;
};

export function buildPrepBriefPrompt(args: PromptArgs): {
  system: string;
  user: string;
} {
  const { event, context, ourDomain } = args;
  const domain = ourDomain.toLowerCase();

  const attendees = (event.attendees ?? []).map((a) => ({
    email: (a.email ?? "").toLowerCase(),
    name: a.displayName ?? null,
  }));
  const internal = attendees.filter((a) => a.email.endsWith(`@${domain}`));
  const external = attendees.filter((a) => !a.email.endsWith(`@${domain}`));

  const system = [
    "You are the strvx chief-of-staff agent generating a pre-meeting brief for the team.",
    "Output markdown. Use exactly these section headings, in this order:",
    "## Who you're meeting",
    "## Recent context",
    "## Open items",
    "## Suggested talking points",
    "Each section: 2-5 bullets. Be specific, terse, and factual. Cite dates when relevant.",
    "If there's no engagement context, keep the brief shorter — focus on attendees and event metadata.",
    "Never invent facts. If you have no data for a section, write a single bullet '- (no data)'.",
  ].join("\n");

  const eventBlock = {
    title: event.summary ?? "(untitled)",
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    description: event.description ?? null,
    internalAttendees: internal,
    externalAttendees: external,
  };

  const userPayload = {
    event: eventBlock,
    engagement: context,
  };

  const user = [
    "Here is the data for this meeting. Generate the brief.",
    "```json",
    JSON.stringify(userPayload, null, 2),
    "```",
  ].join("\n");

  return { system, user };
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
