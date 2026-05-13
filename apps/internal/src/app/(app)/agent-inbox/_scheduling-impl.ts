// Pure-ish business logic for the scheduling-approval server action. Kept
// in a separate module so the test file can import it without dragging in
// Next's "use server" runtime, and so the deps shape (trigger dispatchers,
// auth) can be injected.

import { eq } from "drizzle-orm";
import { db, emailDrafts, schedulingProposals, users } from "@strvx/db";

export type ApproveScheduleAndSendDeps = {
  /** Resolves the internal users.id for the caller; null = unauthorized. */
  getCallerUserId: () => Promise<string | null>;
  /** Enqueues the Gmail send job for the linked draft. */
  dispatchGmailSend: (draftId: string) => Promise<void>;
  /** Enqueues the right calendar job for the proposal kind. */
  dispatchCalendar: (
    kind: "new_meeting" | "reschedule" | "cancel",
    proposalId: string
  ) => Promise<void>;
};

export type ApproveScheduleAndSendInput = {
  schedulingProposalId: string;
  chosenSlot: { start: string; end: string };
  linkedDraftId: string | null;
};

/**
 * Atomic "approve & schedule" core:
 *
 *   1. Auth-gate via deps.getCallerUserId.
 *   2. Verify proposal exists and is in 'pending' or 'error' state.
 *   3. Verify chosenSlot is in proposed_slots (skipped for 'cancel').
 *   4. DB transaction: flip proposal → 'confirmed', approve linked draft.
 *   5. After commit, enqueue gmailSend + the right calendar job.
 *   6. If either enqueue fails, revert the proposal + draft and rethrow.
 */
export async function approveScheduleAndSendImpl(
  input: ApproveScheduleAndSendInput,
  deps: ApproveScheduleAndSendDeps
): Promise<{ proposalId: string; draftId: string | null }> {
  const userId = await deps.getCallerUserId();
  if (!userId) throw new Error("Unauthorized");

  const [proposal] = await db
    .select({
      id: schedulingProposals.id,
      status: schedulingProposals.status,
      kind: schedulingProposals.kind,
      proposedSlots: schedulingProposals.proposedSlots,
    })
    .from(schedulingProposals)
    .where(eq(schedulingProposals.id, input.schedulingProposalId))
    .limit(1);
  if (!proposal) throw new Error("Scheduling proposal not found");
  if (proposal.status !== "pending" && proposal.status !== "error") {
    throw new Error(`Proposal is ${proposal.status}`);
  }

  // Slot must be one of the proposed slots. For 'cancel' there are no slots
  // to verify against — the chosenSlot is informational only.
  if (proposal.kind !== "cancel") {
    const slots = Array.isArray(proposal.proposedSlots)
      ? (proposal.proposedSlots as Array<{ start: string; end: string }>)
      : [];
    const match = slots.find(
      (s) =>
        s.start === input.chosenSlot.start && s.end === input.chosenSlot.end
    );
    if (!match) {
      throw new Error("Chosen slot is not one of the proposed slots");
    }
  }

  // Capture prior draft state for potential rollback.
  let priorDraftStatus: string | null = null;
  if (input.linkedDraftId) {
    const [draftRow] = await db
      .select({ status: emailDrafts.status })
      .from(emailDrafts)
      .where(eq(emailDrafts.id, input.linkedDraftId))
      .limit(1);
    if (!draftRow) throw new Error("Linked draft not found");
    if (
      draftRow.status !== "pending_review" &&
      draftRow.status !== "approved"
    ) {
      throw new Error(`Linked draft is ${draftRow.status}`);
    }
    priorDraftStatus = draftRow.status;
  }

  const now = new Date();

  // Single DB transaction: flip proposal to 'confirmed' and (optionally)
  // approve the draft.
  await db.transaction(async (tx) => {
    await tx
      .update(schedulingProposals)
      .set({
        status: "confirmed",
        chosenSlot: input.chosenSlot,
        updatedAt: now,
      })
      .where(eq(schedulingProposals.id, input.schedulingProposalId));

    if (input.linkedDraftId) {
      await tx
        .update(emailDrafts)
        .set({
          status: "approved",
          approvedByUserId: userId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(emailDrafts.id, input.linkedDraftId));
    }
  });

  // After commit, enqueue both side-effects. If either fails, revert DB
  // back to its prior state so the human can retry without a half-confirmed
  // proposal sitting around.
  try {
    if (input.linkedDraftId) {
      await deps.dispatchGmailSend(input.linkedDraftId);
    }
    await deps.dispatchCalendar(proposal.kind, input.schedulingProposalId);
  } catch (err) {
    await db
      .update(schedulingProposals)
      .set({ status: "pending", chosenSlot: null, updatedAt: new Date() })
      .where(eq(schedulingProposals.id, input.schedulingProposalId));
    if (input.linkedDraftId) {
      await db
        .update(emailDrafts)
        .set({
          status: (priorDraftStatus ?? "pending_review") as "pending_review",
          approvedByUserId: null,
          approvedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailDrafts.id, input.linkedDraftId));
    }
    throw err;
  }

  return {
    proposalId: input.schedulingProposalId,
    draftId: input.linkedDraftId,
  };
}

/**
 * Resolve users.id for a Supabase authId; used by the production deps in
 * the server action. Returns null when no row matches.
 */
export async function resolveUserIdByAuthId(
  authId: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, authId))
    .limit(1);
  return row?.id ?? null;
}

export type RejectScheduleSlotsDeps = {
  getCallerUserId: () => Promise<string | null>;
};

/**
 * Reject the proposed slots. Pure-ish so test paths can drive it without
 * "use server" — though the production wrapper is the only caller today.
 */
export async function rejectScheduleSlotsImpl(
  schedulingProposalId: string,
  reason: string,
  deps: RejectScheduleSlotsDeps
): Promise<{ ok: true }> {
  const userId = await deps.getCallerUserId();
  if (!userId) throw new Error("Unauthorized");
  if (!reason.trim()) throw new Error("Reason required");

  const [proposal] = await db
    .select({ status: schedulingProposals.status })
    .from(schedulingProposals)
    .where(eq(schedulingProposals.id, schedulingProposalId))
    .limit(1);
  if (!proposal) throw new Error("Scheduling proposal not found");
  if (proposal.status !== "pending") {
    throw new Error(`Proposal is ${proposal.status}`);
  }

  await db
    .update(schedulingProposals)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(schedulingProposals.id, schedulingProposalId));

  return { ok: true };
}
