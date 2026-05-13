import { eq, inArray } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { schedules, logger } from "./client";
import {
  db as defaultDb,
  contacts,
  engagements,
  mailboxOauthTokens,
  meetingPrepBriefs,
} from "@strvx/db";
import {
  fetchCalendarEvents,
  type CheckCalendarOutput,
} from "@/lib/agent/tools/read/check-calendar";
import {
  getAuthedMailboxClientSafe,
  markMailboxRefreshFailure,
} from "@/lib/agent/mailbox-oauth";
import {
  generatePrepBriefForEvent,
  type GeneratePrepBriefResult,
} from "@/lib/agent/prep-brief/generate";
import {
  selectEventsNeedingBrief,
  type PrepEvent,
} from "@/lib/agent/prep-brief/select-events";
import { reportTaskError } from "./_sentry";

const DEFAULT_DOMAIN = "strvx.com";
/** How far out we look for upcoming meetings. */
const LOOKAHEAD_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Make a googleapis calendar client. Stubbed in tests via `calendarFactory`.
 */
type CalendarFactory = (mailboxId: string) => Promise<{
  calendar: calendar_v3.Calendar;
  email: string;
}>;

const defaultCalendarFactory: CalendarFactory = async (mailboxId: string) => {
  // Use the safe variant so a single revoked mailbox doesn't sink
  // the whole cron — we surface a typed error the orchestrator
  // can log + skip on. The throwing helper stays available for
  // callers (e.g. on-demand draft sends) that prefer it.
  const safe = await getAuthedMailboxClientSafe(mailboxId);
  if (!safe.ok) {
    const err = new Error(
      `mailbox.${safe.error}: ${safe.message}`
    ) as Error & { code?: string };
    err.code = safe.error;
    throw err;
  }
  return {
    calendar: google.calendar({ version: "v3", auth: safe.client }),
    email: safe.email,
  };
};

export type RunMeetingPrepBriefArgs = {
  db?: typeof defaultDb;
  /** Pinnable clock for tests. */
  now?: Date;
  /** Override the OAuth → Google client factory for tests. */
  calendarFactory?: CalendarFactory;
  /** Override the generate fn for tests so we don't hit OpenAI. */
  generate?: typeof generatePrepBriefForEvent;
  /** "strvx.com" override (defaults to DEFAULT_DOMAIN). */
  ourDomain?: string;
};

export type MailboxSummary = {
  mailboxId: string;
  email: string;
  status: "ok" | "scope_missing" | "error";
  eventsConsidered: number;
  generated: number;
  errors: number;
};

export type RunMeetingPrepBriefResult = {
  mailboxes: MailboxSummary[];
};

/**
 * Pure orchestration core: enumerate active mailboxes, list their next-60min
 * Google Calendar events, filter to events needing a brief, and generate one
 * per qualifying event. Per-event and per-mailbox errors are logged and
 * counted but never bubble — one bad meeting must not sink the batch.
 */
export async function runMeetingPrepBriefCron(
  args: RunMeetingPrepBriefArgs = {}
): Promise<RunMeetingPrepBriefResult> {
  const db = args.db ?? defaultDb;
  const now = args.now ?? new Date();
  const calendarFactory = args.calendarFactory ?? defaultCalendarFactory;
  const generate = args.generate ?? generatePrepBriefForEvent;
  const ourDomain = (args.ourDomain ?? DEFAULT_DOMAIN).toLowerCase();

  const mailboxes = await db
    .select({
      id: mailboxOauthTokens.id,
      email: mailboxOauthTokens.email,
    })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true));

  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + LOOKAHEAD_MS).toISOString();

  const summaries: MailboxSummary[] = [];

  for (const mb of mailboxes) {
    const summary: MailboxSummary = {
      mailboxId: mb.id,
      email: mb.email,
      status: "ok",
      eventsConsidered: 0,
      generated: 0,
      errors: 0,
    };

    let listResult: CheckCalendarOutput;
    try {
      const { calendar } = await calendarFactory(mb.id);
      listResult = await fetchCalendarEvents({
        calendar,
        email: mb.email,
        start: timeMin,
        end: timeMax,
      });
    } catch (err) {
      // Surface auth-shaped errors as a separate "disconnected" status
      // and record a refresh failure on the mailbox row so the UI
      // disconnect banner picks it up. Other errors are still counted
      // but stay scoped to this mailbox so the batch can continue.
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code;
      const isDisconnect =
        code === "disconnected" ||
        code === "not_found" ||
        /invalid_grant|invalid_token|token has been expired or revoked|unauthorized_client/i.test(
          message
        );
      if (isDisconnect && code !== "not_found") {
        try {
          await markMailboxRefreshFailure({ mailboxId: mb.id, error: err });
        } catch (markErr) {
          logger.warn("prep-brief: markMailboxRefreshFailure failed", {
            mailboxId: mb.id,
            err: markErr instanceof Error ? markErr.message : String(markErr),
          });
        }
      }
      summary.status = isDisconnect ? "error" : "error";
      summary.errors = 1;
      logger.error("prep-brief: events.list failed", {
        mailboxId: mb.id,
        email: mb.email,
        err: message,
        disconnect: isDisconnect,
      });
      summaries.push(summary);
      continue;
    }

    if ("error" in listResult && listResult.error === "calendar_scope_missing") {
      summary.status = "scope_missing";
      logger.warn("prep-brief: calendar scope missing", {
        mailboxId: mb.id,
        email: mb.email,
      });
      summaries.push(summary);
      continue;
    }

    // Now we know it's the OK branch.
    const rawEvents = listResult.events;
    if (rawEvents.length === 0) {
      summaries.push(summary);
      continue;
    }

    // The fetchCalendarEvents helper shapes events into the read-tool format
    // (which loses some fields). We re-fetch raw items via the calendar client
    // already-checked shape — but the simpler thing is to convert from the
    // shaped form into PrepEvent. The shaped attendees lack displayName, but
    // that's fine — we use email only for internal/external bucketing.
    const prepEvents: PrepEvent[] = rawEvents.map((e) => ({
      id: e.id,
      summary: e.summary,
      start: { dateTime: e.start },
      end: { dateTime: e.end },
      attendees: (e.attendees ?? []).map((email) => ({ email })),
      status: e.status,
      description: null,
    }));

    summary.eventsConsidered = prepEvents.length;

    // Idempotency: load existing brief ids for this batch of events.
    const eventIds = prepEvents
      .map((e) => e.id)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    const existing =
      eventIds.length === 0
        ? []
        : await db
            .select({ calendarEventId: meetingPrepBriefs.calendarEventId })
            .from(meetingPrepBriefs)
            .where(inArray(meetingPrepBriefs.calendarEventId, eventIds));
    const existingIds = new Set(existing.map((r) => r.calendarEventId));

    const needBrief = selectEventsNeedingBrief({
      events: prepEvents,
      existingBriefIds: existingIds,
      ourDomain,
    });

    for (const ev of needBrief) {
      const engagementId = await resolveEngagementForEvent(
        db,
        ev,
        ourDomain
      );
      try {
        const result: GeneratePrepBriefResult = await generate({
          db,
          event: ev,
          engagementId,
          mailboxId: mb.id,
          ourDomain,
        });
        summary.generated += 1;
        logger.info("prep-brief: generated", {
          mailboxId: mb.id,
          calendarEventId: ev.id,
          engagementId,
          briefId: result.briefId,
          cosRunId: result.cosRunId,
        });
      } catch (err) {
        summary.errors += 1;
        logger.error("prep-brief: generation failed", {
          mailboxId: mb.id,
          calendarEventId: ev.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    summaries.push(summary);
  }

  return { mailboxes: summaries };
}

/**
 * Best-effort engagement match: pick the first external attendee whose email
 * matches a `contacts.email` row, then return the most-recently-created
 * non-archived engagement on that contact's company. Returns null when no
 * unambiguous match exists.
 */
async function resolveEngagementForEvent(
  db: typeof defaultDb,
  event: PrepEvent,
  ourDomain: string
): Promise<string | null> {
  const externals = (event.attendees ?? [])
    .map((a) => (a.email ?? "").toLowerCase())
    .filter((e) => e.includes("@") && !e.endsWith(`@${ourDomain}`));
  if (externals.length === 0) return null;

  for (const email of externals) {
    const [contactRow] = await db
      .select({ companyId: contacts.companyId })
      .from(contacts)
      .where(eq(contacts.email, email))
      .limit(1);
    if (!contactRow) continue;

    const [eng] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(eq(engagements.companyId, contactRow.companyId))
      .limit(1);
    if (eng) return eng.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Trigger.dev cron schedule
// ---------------------------------------------------------------------------

export const meetingPrepBrief = schedules.task({
  id: "meeting.prep.brief",
  cron: "*/15 * * * *", // every 15 minutes
  run: async () => {
    try {
      const result = await runMeetingPrepBriefCron({});
      logger.info("meeting.prep.brief tick", {
        mailboxCount: result.mailboxes.length,
        generated: result.mailboxes.reduce((s, m) => s + m.generated, 0),
        errors: result.mailboxes.reduce((s, m) => s + m.errors, 0),
      });
      return result;
    } catch (err) {
      reportTaskError("meeting.prep.brief", err);
      throw err;
    }
  },
});
