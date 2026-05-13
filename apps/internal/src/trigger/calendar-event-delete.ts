import { eq } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { task, logger } from "./client";
import {
  db as defaultDb,
  calendarEvents,
  schedulingProposals,
} from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { markProposalError } from "./calendar-event-create";
import { reportTaskError } from "./_sentry";

function isScopeMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; status?: number; message?: string };
  const code = e.code ?? e.status;
  if (code !== 403) return false;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("insufficient") ||
    msg.includes("scope") ||
    msg.includes("permission")
  );
}

export type CalendarEventDeleteResult =
  | { status: "cancelled"; googleEventId: string }
  | { status: "skipped"; reason: "already_cancelled" }
  | { status: "error"; error: "calendar_scope_missing"; message: string };

/**
 * Cancel the existing Google Calendar event referenced by the proposal.
 * Idempotent: if proposal.status is already 'cancelled', skip.
 * Throws if kind !== 'cancel' or required fields are missing.
 */
export async function runCalendarEventDelete(args: {
  schedulingProposalId: string;
  calendar: calendar_v3.Calendar;
  db: typeof defaultDb;
}): Promise<CalendarEventDeleteResult> {
  const { schedulingProposalId, calendar, db } = args;

  const [proposal] = await db
    .select()
    .from(schedulingProposals)
    .where(eq(schedulingProposals.id, schedulingProposalId))
    .limit(1);

  if (!proposal) {
    throw new Error(`Scheduling proposal ${schedulingProposalId} not found`);
  }
  if (proposal.kind !== "cancel") {
    throw new Error(
      `Proposal ${schedulingProposalId} kind is ${proposal.kind}, expected 'cancel'`
    );
  }
  if (proposal.status === "cancelled") {
    return { status: "skipped", reason: "already_cancelled" };
  }
  if (proposal.status !== "confirmed") {
    throw new Error(
      `Proposal ${schedulingProposalId} status is ${proposal.status}, expected 'confirmed'`
    );
  }
  if (!proposal.existingCalendarEventId) {
    throw new Error(
      `Proposal ${schedulingProposalId} missing existing_calendar_event_id`
    );
  }

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId: proposal.existingCalendarEventId,
    });

    await db.transaction(async (tx) => {
      await tx
        .update(schedulingProposals)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(schedulingProposals.id, schedulingProposalId));

      await tx
        .delete(calendarEvents)
        .where(
          eq(calendarEvents.googleEventId, proposal.existingCalendarEventId!)
        );
    });

    logger.info("Calendar event cancelled", {
      schedulingProposalId,
      googleEventId: proposal.existingCalendarEventId,
    });

    return {
      status: "cancelled",
      googleEventId: proposal.existingCalendarEventId,
    };
  } catch (err) {
    if (isScopeMissingError(err)) {
      const message =
        err instanceof Error ? err.message : "calendar scope missing";
      await markProposalError(db, proposal.id, proposal.cosRunId, {
        error: "calendar_scope_missing",
        message,
      });
      return { status: "error", error: "calendar_scope_missing", message };
    }
    throw err;
  }
}

export const calendarEventDelete = task({
  id: "calendar.event.delete",
  retry: { maxAttempts: 3 },
  run: async (payload: { schedulingProposalId: string }) => {
    try {
      const [proposal] = await defaultDb
        .select({
          id: schedulingProposals.id,
          mailboxId: schedulingProposals.mailboxId,
        })
        .from(schedulingProposals)
        .where(eq(schedulingProposals.id, payload.schedulingProposalId))
        .limit(1);
      if (!proposal) {
        throw new Error(
          `Scheduling proposal ${payload.schedulingProposalId} not found`
        );
      }
      const safe = await getAuthedMailboxClientSafe(proposal.mailboxId);
      if (!safe.ok) {
        if (safe.error === "transient") {
          throw new Error(
            `calendar.event.delete: transient OAuth failure: ${safe.message}`
          );
        }
        throw new Error(
          `calendar.event.delete: mailbox ${safe.error} for proposal ${payload.schedulingProposalId}: ${safe.message}`
        );
      }
      const calendar = google.calendar({ version: "v3", auth: safe.client });
      return await runCalendarEventDelete({
        schedulingProposalId: payload.schedulingProposalId,
        calendar,
        db: defaultDb,
      });
    } catch (err) {
      reportTaskError("calendar.event.delete", err, {
        extras: { schedulingProposalId: payload.schedulingProposalId },
      });
      throw err;
    }
  },
});
