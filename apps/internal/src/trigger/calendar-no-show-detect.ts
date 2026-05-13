import { and, eq, isNotNull } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { schedules, logger } from "./client";
import {
  db as defaultDb,
  calendarEvents,
  followUpWatchers,
  mailboxOauthTokens,
} from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { reportTaskError } from "./_sentry";

const DEFAULT_DOMAIN = "strvx.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NoShowResult = {
  googleEventId: string;
  outcome: "inserted" | "skipped_existing" | "skipped_no_signal" | "error";
  signals?: string[];
  error?: string;
};

export type CalendarFactory = (mailboxId: string) => Promise<{
  calendar: calendar_v3.Calendar;
  email: string;
}>;

const defaultCalendarFactory: CalendarFactory = async (mailboxId: string) => {
  const safe = await getAuthedMailboxClientSafe(mailboxId);
  if (!safe.ok) {
    const err = new Error(
      `no-show-detect: mailbox.${safe.error}: ${safe.message}`
    ) as Error & { code?: string };
    err.code = safe.error;
    throw err;
  }
  return {
    calendar: google.calendar({ version: "v3", auth: safe.client }),
    email: safe.email,
  };
};

export type RunNoShowDetectArgs = {
  db?: typeof defaultDb;
  now?: Date;
  /** End-of-event window: pick events ended (windowStartMinutesAgo, windowEndMinutesAgo] minutes ago. */
  windowStartMinutesAgo?: number; // default 30
  windowEndMinutesAgo?: number; // default 15
  ourDomain?: string;
  calendarFactory?: CalendarFactory;
};

export type RunNoShowDetectResult = {
  candidates: number;
  results: NoShowResult[];
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Sweep recent calendar events for no-show signals. We look at events whose
 * computed end time falls inside a [15min, 30min] ago window, fetch the
 * authoritative event from Google Calendar via the first active mailbox, and
 * inspect external attendees' responseStatus values. If any external attendee
 * is in `needsAction` or `declined` we insert a `no_show` follow-up watcher,
 * unless a watcher for this google_event_id already exists.
 */
export async function runNoShowDetectCron(
  args: RunNoShowDetectArgs = {}
): Promise<RunNoShowDetectResult> {
  const db = args.db ?? defaultDb;
  const now = args.now ?? new Date();
  const windowStartMinutesAgo = args.windowStartMinutesAgo ?? 30;
  const windowEndMinutesAgo = args.windowEndMinutesAgo ?? 15;
  const ourDomain = (args.ourDomain ?? DEFAULT_DOMAIN).toLowerCase();
  const calendarFactory = args.calendarFactory ?? defaultCalendarFactory;

  const windowStart = new Date(
    now.getTime() - windowStartMinutesAgo * 60 * 1000
  );
  const windowEnd = new Date(now.getTime() - windowEndMinutesAgo * 60 * 1000);

  // Find candidate calendar events: linked to an engagement, with a google
  // event id, whose computed end falls inside the window.
  const eventRows = (await db
    .select({
      id: calendarEvents.id,
      date: calendarEvents.date,
      startHour: calendarEvents.startHour,
      durationHours: calendarEvents.durationHours,
      engagementId: calendarEvents.engagementId,
      googleEventId: calendarEvents.googleEventId,
    })
    .from(calendarEvents)
    .where(
      and(
        isNotNull(calendarEvents.engagementId),
        isNotNull(calendarEvents.googleEventId)
      )
    )) as Array<{
    id: string;
    date: string;
    startHour: string;
    durationHours: string;
    engagementId: string | null;
    googleEventId: string | null;
  }>;

  const candidates = eventRows.filter((row) => {
    const end = computeEndUtc(row.date, row.startHour, row.durationHours);
    return end >= windowStart && end <= windowEnd;
  });

  const results: NoShowResult[] = [];
  if (candidates.length === 0) {
    return { candidates: 0, results };
  }

  // Resolve the first active mailbox to use for events.get.
  const [activeMailbox] = await db
    .select({ id: mailboxOauthTokens.id })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true))
    .limit(1);
  if (!activeMailbox) {
    logger.warn("no-show-detect: no active mailbox available");
    return { candidates: candidates.length, results };
  }

  let calendar: calendar_v3.Calendar | null = null;
  try {
    const built = await calendarFactory(activeMailbox.id);
    calendar = built.calendar;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "transient") {
      // Bubble up so Trigger.dev retries the tick.
      throw err;
    }
    logger.error("no-show-detect: calendarFactory failed", {
      err: err instanceof Error ? err.message : String(err),
      code,
    });
    return { candidates: candidates.length, results };
  }

  for (const row of candidates) {
    if (!row.googleEventId || !row.engagementId) continue;
    try {
      // Idempotency — any no_show watcher for this event short-circuits.
      const [existing] = await db
        .select({ id: followUpWatchers.id })
        .from(followUpWatchers)
        .where(
          and(
            eq(followUpWatchers.kind, "no_show"),
            eq(followUpWatchers.calendarEventId, row.googleEventId)
          )
        )
        .limit(1);
      if (existing) {
        results.push({
          googleEventId: row.googleEventId,
          outcome: "skipped_existing",
        });
        continue;
      }

      let resp;
      try {
        resp = await calendar.events.get({
          calendarId: "primary",
          eventId: row.googleEventId,
        });
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === 403) {
          logger.warn("no-show-detect: 403 from events.get; skipping", {
            eventId: row.googleEventId,
          });
          results.push({
            googleEventId: row.googleEventId,
            outcome: "error",
            error: "forbidden",
          });
          continue;
        }
        results.push({
          googleEventId: row.googleEventId,
          outcome: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const signals: string[] = [];
      const attendees = resp.data.attendees ?? [];
      for (const a of attendees) {
        const email = (a.email ?? "").toLowerCase();
        if (!email || email.endsWith(`@${ourDomain}`)) continue;
        const status = a.responseStatus ?? "";
        if (status === "needsAction" || status === "declined") {
          signals.push(`${email}:${status}`);
        }
      }

      if (signals.length === 0) {
        results.push({
          googleEventId: row.googleEventId,
          outcome: "skipped_no_signal",
        });
        continue;
      }

      // Insert no_show watcher.
      await db.insert(followUpWatchers).values({
        kind: "no_show",
        threadId: null,
        engagementId: row.engagementId,
        calendarEventId: row.googleEventId,
        triggerAfter: now,
        status: "pending",
        ruleConfig: {
          origin: "no_show_cron",
          signals,
        },
      });
      results.push({
        googleEventId: row.googleEventId,
        outcome: "inserted",
        signals,
      });
    } catch (err) {
      results.push({
        googleEventId: row.googleEventId,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { candidates: candidates.length, results };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Combine a calendar_events row's `date + startHour + durationHours` (all
 * UTC-naive) into a single UTC end timestamp. Mirrors the logic used in
 * follow-up-fire's defaultFetchEventEndAt for parity.
 */
export function computeEndUtc(
  date: string,
  startHour: string,
  durationHours: string
): Date {
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  const sh = parseFloat(startHour);
  const dh = parseFloat(durationHours);
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) + sh * 3600 * 1000;
  const endMs = startMs + dh * 3600 * 1000;
  return new Date(endMs);
}

// ---------------------------------------------------------------------------
// Trigger.dev cron schedule
// ---------------------------------------------------------------------------

export const calendarNoShowDetect = schedules.task({
  id: "calendar.no_show.detect",
  cron: "*/15 * * * *", // every 15 minutes
  run: async () => {
    try {
      const result = await runNoShowDetectCron({});
      logger.info("calendar.no_show.detect tick", {
        candidates: result.candidates,
        inserted: result.results.filter((r) => r.outcome === "inserted").length,
        errors: result.results.filter((r) => r.outcome === "error").length,
      });
      return result;
    } catch (err) {
      reportTaskError("calendar.no_show.detect", err);
      throw err;
    }
  },
});
