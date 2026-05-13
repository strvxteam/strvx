"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, emailDrafts, emailThreads, users } from "@strvx/db";
import { createClient } from "@/lib/supabase/server";
import { gmailSend } from "@/trigger/gmail-send";
import {
  approveScheduleAndSendImpl,
  rejectScheduleSlotsImpl,
  resolveUserIdByAuthId,
} from "./_scheduling-impl";
import {
  addLabelImpl,
  archiveThreadImpl,
  removeLabelImpl,
  snoozeThreadImpl,
} from "./_triage-impl";
import { searchEmails } from "./_search";

const composeReplySchema = z.object({
  threadId: z.string().uuid(),
  toEmails: z.array(z.string().email()).min(1),
  ccEmails: z.array(z.string().email()).default([]),
  bccEmails: z.array(z.string().email()).default([]),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  bodyHtml: z.string().optional(),
});

export async function sendComposedReply(formData: FormData) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    throw new Error("Unauthorized");
  }

  // 2. Resolve internal user id (users.authId → users.id)
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, user.id))
    .limit(1);
  if (!userRow) throw new Error("User not provisioned");

  // 3. Validate payload
  const parsed = composeReplySchema.safeParse({
    threadId: formData.get("threadId"),
    toEmails: JSON.parse((formData.get("toEmails") as string) || "[]"),
    ccEmails: JSON.parse((formData.get("ccEmails") as string) || "[]"),
    bccEmails: JSON.parse((formData.get("bccEmails") as string) || "[]"),
    subject: formData.get("subject"),
    bodyText: formData.get("bodyText"),
    bodyHtml: formData.get("bodyHtml") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const input = parsed.data;

  // 4. Load thread to get mailboxId
  const [thread] = await db
    .select({ mailboxId: emailThreads.mailboxId })
    .from(emailThreads)
    .where(eq(emailThreads.id, input.threadId))
    .limit(1);
  if (!thread) throw new Error("Thread not found");

  // 5. Insert draft as pre-approved (human composing means human approval).
  const now = new Date();
  const [draft] = await db
    .insert(emailDrafts)
    .values({
      threadId: input.threadId,
      mailboxId: thread.mailboxId,
      status: "approved",
      toEmails: input.toEmails,
      ccEmails: input.ccEmails,
      bccEmails: input.bccEmails,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      humanEdited: true,
      approvedByUserId: userRow.id,
      approvedAt: now,
      confidence: "high",
    })
    .returning({ id: emailDrafts.id });

  // 6. Enqueue the send.
  await gmailSend.trigger({ draftId: draft.id });

  return { draftId: draft.id };
}

// ── Agent draft review actions ─────────────────────────────────────────────

export async function approveDraftAndSend(draftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    throw new Error("Unauthorized");
  }

  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, user.id))
    .limit(1);
  if (!userRow) throw new Error("User not provisioned");

  // Verify draft exists and is in a sendable state.
  const [draft] = await db
    .select({
      id: emailDrafts.id,
      status: emailDrafts.status,
    })
    .from(emailDrafts)
    .where(eq(emailDrafts.id, draftId))
    .limit(1);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "pending_review" && draft.status !== "approved") {
    throw new Error(`Draft is ${draft.status}`);
  }

  // Approve.
  const now = new Date();
  await db
    .update(emailDrafts)
    .set({
      status: "approved",
      approvedByUserId: userRow.id,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(emailDrafts.id, draftId));

  await gmailSend.trigger({ draftId });

  return { draftId };
}

export async function updateDraftBody(
  draftId: string,
  body: { subject: string; bodyText: string; bodyHtml?: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    throw new Error("Unauthorized");
  }

  const [draft] = await db
    .select({ id: emailDrafts.id, status: emailDrafts.status })
    .from(emailDrafts)
    .where(eq(emailDrafts.id, draftId))
    .limit(1);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "pending_review") {
    throw new Error(`Cannot edit a ${draft.status} draft`);
  }

  await db
    .update(emailDrafts)
    .set({
      subject: body.subject,
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      humanEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(emailDrafts.id, draftId));

  return { ok: true };
}

export async function rejectDraft(draftId: string, reason: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    throw new Error("Unauthorized");
  }

  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, user.id))
    .limit(1);
  if (!userRow) throw new Error("User not provisioned");

  await db
    .update(emailDrafts)
    .set({
      status: "rejected",
      rejectedByUserId: userRow.id,
      rejectedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(emailDrafts.id, draftId));

  return { ok: true };
}

// ── Scheduling proposal actions ────────────────────────────────────────────

/**
 * Auth-gate the caller and resolve their internal users.id, or return null
 * if they don't have a @strvx.com session or haven't been provisioned.
 * Used as the production `getCallerUserId` dep for the scheduling impl.
 */
async function authedStrvxUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) return null;
  return resolveUserIdByAuthId(user.id);
}

/**
 * Combined "approve schedule + send reply" server action. Thin wrapper —
 * see _scheduling-impl.ts for the core logic + rollback semantics.
 *
 * NOTE: the source repo dispatches calendar-event-{create,update,delete}
 * Trigger.dev tasks here; those tasks have not been ported to this app
 * yet, so the calendar dispatcher is a logged no-op for now. The
 * scheduling proposal still flips to `confirmed` and the linked draft
 * still sends — the Google Calendar event will be created in a later slice.
 */
export async function approveScheduleAndSend(
  schedulingProposalId: string,
  chosenSlot: { start: string; end: string },
  linkedDraftId: string | null
): Promise<{ proposalId: string; draftId: string | null }> {
  return approveScheduleAndSendImpl(
    { schedulingProposalId, chosenSlot, linkedDraftId },
    {
      getCallerUserId: authedStrvxUserId,
      dispatchGmailSend: async (draftId) => {
        await gmailSend.trigger({ draftId });
      },
      dispatchCalendar: async (kind, proposalId) => {
        // TODO(chief-of-staff slice 7+): wire calendarEventCreate /
        // calendarEventUpdate / calendarEventDelete Trigger.dev tasks
        // here once they are ported. Until then this is a no-op so the
        // approve-and-send flow still succeeds end-to-end on the email
        // side.
        console.log(
          "[agent-inbox] calendar dispatcher not implemented yet",
          { kind, proposalId }
        );
      },
    }
  );
}

export async function rejectScheduleSlots(
  schedulingProposalId: string,
  reason: string
): Promise<{ ok: true }> {
  return rejectScheduleSlotsImpl(schedulingProposalId, reason, {
    getCallerUserId: authedStrvxUserId,
  });
}

// ── Triage actions (archive, snooze, labels) ───────────────────────────────

export async function archiveThread(threadId: string): Promise<{ ok: true }> {
  return archiveThreadImpl(threadId, {
    getCallerUserId: authedStrvxUserId,
  });
}

export async function snoozeThread(
  threadId: string,
  untilISO: string
): Promise<{ ok: true }> {
  return snoozeThreadImpl(threadId, untilISO, {
    getCallerUserId: authedStrvxUserId,
  });
}

export async function addLabel(
  threadId: string,
  label: string
): Promise<{ ok: true; label: string }> {
  return addLabelImpl(threadId, label, {
    getCallerUserId: authedStrvxUserId,
  });
}

export async function removeLabel(
  threadId: string,
  label: string
): Promise<{ ok: true; label: string }> {
  return removeLabelImpl(threadId, label, {
    getCallerUserId: authedStrvxUserId,
  });
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchEmailsAction(query: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email?.endsWith("@strvx.com")) {
    throw new Error("Unauthorized");
  }
  const hits = await searchEmails(query, 25);
  // Date isn't serialisable across the server action wire; stringify.
  return hits.map((h) => ({
    threadId: h.threadId,
    subject: h.subject,
    snippet: h.snippet,
    fromEmail: h.fromEmail,
    sentAt: h.sentAt.toISOString(),
  }));
}
