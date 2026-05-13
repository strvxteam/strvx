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

export type CalendarEventUpdateResult =
  | { status: "updated"; googleEventId: string }
  | { status: "skipped"; reason: "already_updated" }
  | { status: "error"; error: "calendar_scope_missing"; message: string };

/**
 * Reschedule the existing Google Calendar event tied to the proposal.
 * Idempotent: if the local calendar_events row already reflects chosen_slot,
 * we skip. Throws if status !== 'confirmed' or required fields are missing.
 */
export async function runCalendarEventUpdate(args: {
  schedulingProposalId: string;
  calendar: calendar_v3.Calendar;
  db: typeof defaultDb;
}): Promise<CalendarEventUpdateResult> {
  const { schedulingProposalId, calendar, db } = args;

  const [proposal] = await db
    .select()
    .from(schedulingProposals)
    .where(eq(schedulingProposals.id, schedulingProposalId))
    .limit(1);

  if (!proposal) {
    throw new Error(`Scheduling proposal ${schedulingProposalId} not found`);
  }
  if (proposal.kind !== "reschedule") {
    throw new Error(
      `Proposal ${schedulingProposalId} kind is ${proposal.kind}, expected 'reschedule'`
    );
  }
  if (proposal.status !== "confirmed" && proposal.status !== "created") {
    throw new Error(
      `Proposal ${schedulingProposalId} status is ${proposal.status}, expected 'confirmed'`
    );
  }
  if (!proposal.existingCalendarEventId) {
    throw new Error(
      `Proposal ${schedulingProposalId} missing existing_calendar_event_id`
    );
  }

  const chosen = proposal.chosenSlot as { start: string; end: string } | null;
  if (!chosen || !chosen.start || !chosen.end) {
    throw new Error(
      `Proposal ${schedulingProposalId} missing chosen_slot`
    );
  }

  // Idempotency: if our local calendar_events row already matches the new
  // slot, skip the API call.
  const [localRow] = await db
    .select({
      id: calendarEvents.id,
      date: calendarEvents.date,
      startHour: calendarEvents.startHour,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.googleEventId, proposal.existingCalendarEventId))
    .limit(1);

  const startDate = new Date(chosen.start);
  const endDate = new Date(chosen.end);
  const newDate = startDate.toISOString().slice(0, 10);
  const newStartHour =
    startDate.getUTCHours() + startDate.getUTCMinutes() / 60;
  const newDurationHours =
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

  if (
    localRow &&
    localRow.date === newDate &&
    Number(localRow.startHour) === newStartHour &&
    proposal.status === "created"
  ) {
    return { status: "skipped", reason: "already_updated" };
  }

  try {
    await calendar.events.patch({
      calendarId: "primary",
      eventId: proposal.existingCalendarEventId,
      requestBody: {
        start: { dateTime: chosen.start },
        end: { dateTime: chosen.end },
      },
    });

    await db.transaction(async (tx) => {
      await tx
        .update(schedulingProposals)
        .set({
          status: "created",
          createdGoogleEventId: proposal.existingCalendarEventId,
          updatedAt: new Date(),
        })
        .where(eq(schedulingProposals.id, schedulingProposalId));

      if (localRow) {
        await tx
          .update(calendarEvents)
          .set({
            date: newDate,
            startHour: newStartHour.toString(),
            durationHours: newDurationHours.toString(),
          })
          .where(eq(calendarEvents.id, localRow.id));
      }
    });

    logger.info("Calendar event updated", {
      schedulingProposalId,
      googleEventId: proposal.existingCalendarEventId,
    });

    return {
      status: "updated",
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

export const calendarEventUpdate = task({
  id: "calendar.event.update",
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
            `calendar.event.update: transient OAuth failure: ${safe.message}`
          );
        }
        throw new Error(
          `calendar.event.update: mailbox ${safe.error} for proposal ${payload.schedulingProposalId}: ${safe.message}`
        );
      }
      const calendar = google.calendar({ version: "v3", auth: safe.client });
      return await runCalendarEventUpdate({
        schedulingProposalId: payload.schedulingProposalId,
        calendar,
        db: defaultDb,
      });
    } catch (err) {
      reportTaskError("calendar.event.update", err, {
        extras: { schedulingProposalId: payload.schedulingProposalId },
      });
      throw err;
    }
  },
});
