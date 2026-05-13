import { eq, sql } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { task, logger } from "./client";
import {
  db as defaultDb,
  cosRuns,
  calendarEvents,
  emailDrafts,
  emailThreads,
  schedulingProposals,
} from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { schedulePostMeetingWatcher } from "@/lib/agent/follow-up/schedule-post-meeting";
import { reportTaskError } from "./_sentry";

/**
 * Distinguish Google's "insufficient permission" / scope-missing error.
 * Mirrors the helper inside check-calendar.ts but lives here so this module
 * has no dependency on tool code.
 */
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

export type CalendarEventCreateResult =
  | { status: "created"; googleEventId: string; meetLink: string | null }
  | { status: "skipped"; reason: "already_created" }
  | { status: "error"; error: "calendar_scope_missing"; message: string };

/**
 * Pure-ish core for the create job. Takes a calendar client + db so it's
 * testable without OAuth or Trigger.dev. Idempotent: if the proposal already
 * has `createdGoogleEventId`, returns early.
 *
 * Throws if status !== 'confirmed' or chosen_slot is missing — those are
 * approval-gate violations, not retryable errors.
 */
export async function runCalendarEventCreate(args: {
  schedulingProposalId: string;
  calendar: calendar_v3.Calendar;
  db: typeof defaultDb;
}): Promise<CalendarEventCreateResult> {
  const { schedulingProposalId, calendar, db } = args;

  const [proposal] = await db
    .select()
    .from(schedulingProposals)
    .where(eq(schedulingProposals.id, schedulingProposalId))
    .limit(1);

  if (!proposal) {
    throw new Error(`Scheduling proposal ${schedulingProposalId} not found`);
  }

  // Idempotency: a successful prior run sets this. Skip work.
  if (proposal.createdGoogleEventId) {
    return { status: "skipped", reason: "already_created" };
  }

  if (proposal.status !== "confirmed") {
    throw new Error(
      `Proposal ${schedulingProposalId} status is ${proposal.status}, expected 'confirmed'`
    );
  }

  const chosen = proposal.chosenSlot as { start: string; end: string } | null;
  if (!chosen || !chosen.start || !chosen.end) {
    throw new Error(
      `Proposal ${schedulingProposalId} missing chosen_slot`
    );
  }

  const attendees = Array.isArray(proposal.attendees)
    ? (proposal.attendees as string[])
    : [];

  const requestId = `strvx-${schedulingProposalId}`;
  try {
    const resp = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: proposal.meetingTitle,
        description: proposal.meetingDescription ?? undefined,
        start: { dateTime: chosen.start },
        end: { dateTime: chosen.end },
        attendees: attendees.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const event = resp.data;
    const googleEventId = event.id;
    if (!googleEventId) {
      throw new Error("Google Calendar insert returned no event id");
    }
    const meetLink =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video"
      )?.uri ??
      null;

    // Look up the thread's engagement so the local calendar_events row joins
    // back to the CRM.
    const [thread] = await db
      .select({ engagementId: emailThreads.engagementId })
      .from(emailThreads)
      .where(eq(emailThreads.id, proposal.threadId))
      .limit(1);

    // Choose created_by: prefer the human who approved the linked draft,
    // if any (the schedule was confirmed alongside a reply). Fall through
    // to null when no draft is linked (agent-direct scheduling, no human).
    const [linkedDraft] = await db
      .select({ approvedByUserId: emailDrafts.approvedByUserId })
      .from(emailDrafts)
      .where(eq(emailDrafts.schedulingProposalId, proposal.id))
      .limit(1);
    const createdBy = linkedDraft?.approvedByUserId ?? null;

    // Compute date / startHour / durationHours from the chosen slot, in UTC
    // (calendar_events stores them as numeric / date — the dashboard derives
    // the user-facing time from these). Storing in UTC keeps DST math out of
    // the hot path.
    const startDate = new Date(chosen.start);
    const endDate = new Date(chosen.end);
    const date = startDate.toISOString().slice(0, 10); // YYYY-MM-DD
    const startHour =
      startDate.getUTCHours() + startDate.getUTCMinutes() / 60;
    const durationHours =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

    await db.transaction(async (tx) => {
      await tx
        .update(schedulingProposals)
        .set({
          status: "created",
          createdGoogleEventId: googleEventId,
          meetLink,
          updatedAt: new Date(),
        })
        .where(eq(schedulingProposals.id, schedulingProposalId));

      await tx.insert(calendarEvents).values({
        title: proposal.meetingTitle,
        type: "external",
        date,
        startHour: startHour.toString(),
        durationHours: durationHours.toString(),
        engagementId: thread?.engagementId ?? null,
        googleEventId,
        icalUid: event.iCalUID ?? null,
        zoomLink: meetLink,
        createdBy,
      });
    });

    logger.info("Calendar event created", {
      schedulingProposalId,
      googleEventId,
      meetLink,
    });

    // Schedule a post-meeting follow-up watcher. Failures here are logged and
    // swallowed — a missing watcher must NOT roll back the calendar create.
    try {
      const result = await schedulePostMeetingWatcher({
        db,
        calendarEventId: googleEventId,
        engagementId: thread?.engagementId ?? null,
        threadId: proposal.threadId,
        eventEndAt: chosen.end,
      });
      logger.info("Post-meeting watcher scheduled", {
        schedulingProposalId,
        googleEventId,
        watcherId: result.watcherId,
        alreadyExisted: result.alreadyExisted,
      });
    } catch (watcherErr) {
      logger.error("Post-meeting watcher schedule failed", {
        schedulingProposalId,
        googleEventId,
        err:
          watcherErr instanceof Error
            ? watcherErr.message
            : String(watcherErr),
      });
    }

    return { status: "created", googleEventId, meetLink };
  } catch (err) {
    if (isScopeMissingError(err)) {
      const message =
        err instanceof Error ? err.message : "calendar scope missing";
      await markProposalError(db, proposal.id, proposal.cosRunId, {
        error: "calendar_scope_missing",
        message,
      });
      return {
        status: "error",
        error: "calendar_scope_missing",
        message,
      };
    }
    throw err;
  }
}

export async function markProposalError(
  db: typeof defaultDb,
  proposalId: string,
  cosRunId: string | null,
  payload: { error: string; message: string }
) {
  await db
    .update(schedulingProposals)
    .set({ status: "error", updatedAt: new Date() })
    .where(eq(schedulingProposals.id, proposalId));

  if (cosRunId) {
    // Merge into cos_runs.metadata.calendarError without wiping prior keys.
    await db
      .update(cosRuns)
      .set({
        metadata: sql`COALESCE(${cosRuns.metadata}, '{}'::jsonb) || ${JSON.stringify(
          { calendarError: payload }
        )}::jsonb`,
      })
      .where(eq(cosRuns.id, cosRunId));
  }
}

export const calendarEventCreate = task({
  id: "calendar.event.create",
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
            `calendar.event.create: transient OAuth failure: ${safe.message}`
          );
        }
        throw new Error(
          `calendar.event.create: mailbox ${safe.error} for proposal ${payload.schedulingProposalId}: ${safe.message}`
        );
      }
      const calendar = google.calendar({ version: "v3", auth: safe.client });
      return await runCalendarEventCreate({
        schedulingProposalId: payload.schedulingProposalId,
        calendar,
        db: defaultDb,
      });
    } catch (err) {
      reportTaskError("calendar.event.create", err, {
        extras: { schedulingProposalId: payload.schedulingProposalId },
      });
      throw err;
    }
  },
});
