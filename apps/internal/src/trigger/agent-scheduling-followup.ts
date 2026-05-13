import { eq, sql } from "drizzle-orm";
import { task, logger } from "./client";
import {
  db as defaultDb,
  emailDrafts,
  emailThreads,
  engagements,
  mailboxOauthTokens,
} from "@strvx/db";
import { planThread as defaultPlanThread } from "@/lib/agent/reasoning/plan-thread";
import { reportTaskError } from "./_sentry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentSchedulingFollowupPayload = {
  engagementId: string;
  contactEmail: string;
  startTime: string;
  endTime: string;
  meetLink: string | null;
  bookingId: string;
};

export type AgentSchedulingFollowupOutcome =
  | { status: "planner_triggered"; threadId: string }
  | { status: "draft_created"; draftId: string; threadId: string }
  | { status: "skipped_already_processed"; reason: string };

export type RunAgentSchedulingFollowupArgs = {
  payload: AgentSchedulingFollowupPayload;
  db?: typeof defaultDb;
  /** Override planner for tests so we don't hit OpenAI. */
  planThread?: typeof defaultPlanThread;
};

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Post-booking follow-up:
 *   1. Look up an existing email thread with the booking's contact (by
 *      participants email match).
 *   2. If found, hand off to the planner with `seed_intent =
 *      booking_confirmation` recorded in cos_runs metadata.
 *   3. If not, synthesize a minimal thread row + an agent-authored draft
 *      confirming the booking, leaving the human-approval flow to take over.
 *
 * Idempotent on `bookingId`: re-running for the same bookingId short-circuits
 * if an email_drafts row already references it.
 */
export async function runAgentSchedulingFollowup(
  args: RunAgentSchedulingFollowupArgs
): Promise<AgentSchedulingFollowupOutcome> {
  const db = args.db ?? defaultDb;
  const planThread = args.planThread ?? defaultPlanThread;
  const { payload } = args;
  const lcContact = payload.contactEmail.toLowerCase();

  // Idempotency: a prior run for this bookingId left a draft trail.
  // We key off the deterministic `metadata.bookingId` jsonb field
  // (migration 015) rather than substring-scanning reviewer_notes.
  const [priorDraft] = await db
    .select({ id: emailDrafts.id, threadId: emailDrafts.threadId })
    .from(emailDrafts)
    .where(sql`${emailDrafts.metadata}->>'bookingId' = ${payload.bookingId}`)
    .limit(1);
  if (priorDraft) {
    return {
      status: "skipped_already_processed",
      reason: `Booking ${payload.bookingId} already has draft ${priorDraft.id}`,
    };
  }

  // Resolve the engagement (sanity check + to fetch its primary mailbox).
  const [eng] = await db
    .select({
      id: engagements.id,
    })
    .from(engagements)
    .where(eq(engagements.id, payload.engagementId))
    .limit(1);
  if (!eng) {
    throw new Error(
      `agent.scheduling.followup: engagement ${payload.engagementId} not found`
    );
  }

  // Find an existing thread that has this contact in participants.
  // `participants` is jsonb array of {email,...}; use a JSON ?| containment check.
  const [thread] = (await db
    .select({
      id: emailThreads.id,
      mailboxId: emailThreads.mailboxId,
    })
    .from(emailThreads)
    .where(
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements(${emailThreads.participants}) p
        WHERE lower(p->>'email') = ${lcContact}
      )`
    )
    .limit(1)) as Array<{ id: string; mailboxId: string }>;

  if (thread) {
    logger.info("agent.scheduling.followup: existing thread — triggering planner", {
      threadId: thread.id,
      engagementId: payload.engagementId,
      bookingId: payload.bookingId,
    });
    await planThread({ threadId: thread.id });
    return { status: "planner_triggered", threadId: thread.id };
  }

  // No thread → create a minimal placeholder + agent-authored draft.
  const [primaryMailbox] = await db
    .select({ id: mailboxOauthTokens.id, email: mailboxOauthTokens.email })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true))
    .limit(1);
  if (!primaryMailbox) {
    throw new Error(
      "agent.scheduling.followup: no active mailbox to attach draft to"
    );
  }

  const startedAt = new Date(payload.startTime);
  const friendlyTime = startedAt.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const subject = `Confirmed: Discovery call — ${friendlyTime}`;
  const body = buildConfirmationBody({
    contactEmail: payload.contactEmail,
    startTime: payload.startTime,
    endTime: payload.endTime,
    meetLink: payload.meetLink,
    friendlyTime,
  });

  const result = await db.transaction(async (tx) => {
    const [newThread] = await tx
      .insert(emailThreads)
      .values({
        mailboxId: primaryMailbox.id,
        // No synthetic id: gmail_thread_id is nullable as of migration
        // 015 and the real id is backfilled by gmail.send after the
        // first message in the thread is delivered.
        gmailThreadId: null,
        subject,
        participants: [
          { email: payload.contactEmail, name: null, role: "client" },
          { email: primaryMailbox.email, name: null, role: "internal" },
        ],
        messageCount: 0,
        lastMessageAt: new Date(),
        engagementId: payload.engagementId,
        agentState: "drafted",
      })
      .returning({ id: emailThreads.id });

    const [draft] = await tx
      .insert(emailDrafts)
      .values({
        threadId: newThread.id,
        mailboxId: primaryMailbox.id,
        status: "pending_review",
        toEmails: [payload.contactEmail],
        ccEmails: [],
        bccEmails: [],
        subject,
        bodyText: body,
        confidence: "medium",
        reviewerNotes: "agent.scheduling.followup",
        metadata: { bookingId: payload.bookingId },
      })
      .returning({ id: emailDrafts.id });

    return { threadId: newThread.id, draftId: draft.id };
  });

  logger.info("agent.scheduling.followup: draft created", {
    draftId: result.draftId,
    threadId: result.threadId,
    engagementId: payload.engagementId,
    bookingId: payload.bookingId,
  });

  return {
    status: "draft_created",
    draftId: result.draftId,
    threadId: result.threadId,
  };
}

function buildConfirmationBody(args: {
  contactEmail: string;
  startTime: string;
  endTime: string;
  meetLink: string | null;
  friendlyTime: string;
}): string {
  const lines: string[] = [];
  lines.push(`Hi,`);
  lines.push("");
  lines.push(`Confirming our discovery call for ${args.friendlyTime}.`);
  if (args.meetLink) {
    lines.push("");
    lines.push(`Google Meet: ${args.meetLink}`);
  }
  lines.push("");
  lines.push(
    "Looking forward to it. If anything comes up before then, just reply here."
  );
  lines.push("");
  lines.push("— strvx");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Trigger.dev task
// ---------------------------------------------------------------------------

export const agentSchedulingFollowup = task({
  id: "agent.scheduling.followup",
  retry: { maxAttempts: 3 },
  run: async (payload: AgentSchedulingFollowupPayload) => {
    try {
      return await runAgentSchedulingFollowup({ payload });
    } catch (err) {
      reportTaskError("agent.scheduling.followup", err, {
        extras: {
          engagementId: payload.engagementId,
          bookingId: payload.bookingId,
        },
      });
      throw err;
    }
  },
});
