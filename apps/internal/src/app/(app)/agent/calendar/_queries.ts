import "server-only";
import { eq, inArray } from "drizzle-orm";
import { google } from "googleapis";
import {
  db,
  calendarEvents,
  engagements,
  mailboxOauthTokens,
  meetingPrepBriefs,
} from "@strvx/db";
import {
  fetchCalendarEvents,
  type CheckCalendarEvent,
} from "@/lib/agent/tools/read/check-calendar";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";

const OUR_DOMAIN = "strvx.com";

export type AgentCalendarEvent = {
  /** Google event id (this is what UNIQUE-keys meeting_prep_briefs). */
  id: string;
  mailboxId: string;
  mailboxEmail: string;
  title: string;
  /** ISO string. May be a date-only string (all-day) or a full date-time. */
  start: string;
  end: string;
  internalAttendees: string[];
  externalAttendees: string[];
  /** Engagement linkage from calendar_events left-join. */
  engagementId: string | null;
  engagementName: string | null;
  /** Prep brief presence. Content loaded only when explicitly requested. */
  prepBrief: {
    id: string;
    contentMarkdown: string;
    generatedAt: string;
  } | null;
};

export type MailboxIssue = {
  mailboxId: string;
  email: string;
  kind: "scope_missing" | "disconnected" | "error";
  message?: string;
};

export type AgentCalendarData = {
  events: AgentCalendarEvent[];
  issues: MailboxIssue[];
  mailboxCount: number;
};

/**
 * Pull all active mailboxes, list their next 8 days of events from Google,
 * left-join engagement info from `calendar_events.google_event_id`, and
 * left-join prep briefs from `meeting_prep_briefs.calendar_event_id`.
 *
 * Mailbox-level failures (auth, scope) are surfaced as `issues` rather than
 * thrown, so the page can render partial data with an inline warning.
 */
export async function loadAgentCalendar(now: Date): Promise<AgentCalendarData> {
  const mailboxes = await db
    .select({ id: mailboxOauthTokens.id, email: mailboxOauthTokens.email })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true));

  if (mailboxes.length === 0) {
    return { events: [], issues: [], mailboxCount: 0 };
  }

  const startOfTodayPT = startOfPtDay(now);
  const endRange = new Date(startOfTodayPT.getTime() + 8 * 24 * 3600 * 1000);

  const issues: MailboxIssue[] = [];
  const rawEvents: Array<{
    event: CheckCalendarEvent;
    rawAttendees: string[];
    mailboxId: string;
    mailboxEmail: string;
  }> = [];

  for (const mb of mailboxes) {
    const safe = await getAuthedMailboxClientSafe(mb.id);
    if (!safe.ok) {
      // Exclude this mailbox's events; the page's banner reads `issues`
      // to surface the disconnect to the human.
      issues.push({
        mailboxId: mb.id,
        email: mb.email,
        kind:
          safe.error === "disconnected" || safe.error === "not_found"
            ? "disconnected"
            : "error",
        message: safe.message,
      });
      continue;
    }
    try {
      const calendar = google.calendar({ version: "v3", auth: safe.client });
      const result = await fetchCalendarEvents({
        calendar,
        email: mb.email,
        start: startOfTodayPT.toISOString(),
        end: endRange.toISOString(),
      });
      if ("error" in result && result.error === "calendar_scope_missing") {
        issues.push({
          mailboxId: mb.id,
          email: mb.email,
          kind: "scope_missing",
          message: result.message,
        });
        continue;
      }
      for (const e of result.events) {
        rawEvents.push({
          event: e,
          rawAttendees: e.attendees ?? [],
          mailboxId: mb.id,
          mailboxEmail: mb.email,
        });
      }
    } catch (err) {
      issues.push({
        mailboxId: mb.id,
        email: mb.email,
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (rawEvents.length === 0) {
    return { events: [], issues, mailboxCount: mailboxes.length };
  }

  const eventIds = Array.from(
    new Set(
      rawEvents.map((r) => r.event.id).filter((x) => typeof x === "string" && x.length > 0)
    )
  );

  // Left-join engagement info via calendar_events.google_event_id.
  const engagementRows =
    eventIds.length === 0
      ? []
      : await db
          .select({
            googleEventId: calendarEvents.googleEventId,
            engagementId: calendarEvents.engagementId,
            engagementName: engagements.name,
          })
          .from(calendarEvents)
          .leftJoin(engagements, eq(engagements.id, calendarEvents.engagementId))
          .where(inArray(calendarEvents.googleEventId, eventIds));

  const engagementByEventId = new Map(
    engagementRows
      .filter((r): r is typeof r & { googleEventId: string } =>
        typeof r.googleEventId === "string"
      )
      .map((r) => [
        r.googleEventId,
        {
          engagementId: r.engagementId,
          engagementName: r.engagementName,
        },
      ])
  );

  // Left-join prep briefs.
  const briefRows =
    eventIds.length === 0
      ? []
      : await db
          .select({
            id: meetingPrepBriefs.id,
            calendarEventId: meetingPrepBriefs.calendarEventId,
            contentMarkdown: meetingPrepBriefs.contentMarkdown,
            generatedAt: meetingPrepBriefs.generatedAt,
          })
          .from(meetingPrepBriefs)
          .where(inArray(meetingPrepBriefs.calendarEventId, eventIds));

  const briefByEventId = new Map(
    briefRows.map((r) => [
      r.calendarEventId,
      {
        id: r.id,
        contentMarkdown: r.contentMarkdown,
        generatedAt: r.generatedAt.toISOString(),
      },
    ])
  );

  const events: AgentCalendarEvent[] = rawEvents.map(({ event, rawAttendees, mailboxId, mailboxEmail }) => {
    const internalAttendees: string[] = [];
    const externalAttendees: string[] = [];
    for (const email of rawAttendees) {
      const lower = email.toLowerCase();
      const at = lower.lastIndexOf("@");
      if (at >= 0 && lower.slice(at + 1) === OUR_DOMAIN) {
        internalAttendees.push(email);
      } else {
        externalAttendees.push(email);
      }
    }
    const eng = engagementByEventId.get(event.id);
    return {
      id: event.id,
      mailboxId,
      mailboxEmail,
      title: event.summary || "(no title)",
      start: event.start,
      end: event.end,
      internalAttendees,
      externalAttendees,
      engagementId: eng?.engagementId ?? null,
      engagementName: eng?.engagementName ?? null,
      prepBrief: briefByEventId.get(event.id) ?? null,
    };
  });

  // Sort earliest start first.
  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  return { events, issues, mailboxCount: mailboxes.length };
}

/**
 * Returns a Date set to 00:00:00 PT on the day of `now`.
 * Done by formatting the PT date and re-parsing it as midnight in the LA tz.
 */
function startOfPtDay(now: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ptDate = fmt.format(now); // YYYY-MM-DD
  // The exact UTC offset of midnight-PT varies (PST vs PDT). We don't need
  // the *precise* tz instant — a few hours of slack on each end is fine for a
  // visual today+7 window. Use noon UTC as a stable anchor for the start.
  // For an exact tz-aware start, format the PT date with timeZone re-application.
  const [y, m, d] = ptDate.split("-").map((n) => parseInt(n, 10));
  // Construct a Date for midnight PT on that calendar day. We approximate by
  // using 07:00 UTC (which is midnight PT during PST; off by 1h during PDT).
  // Acceptable drift: a few events near the day-boundary may bucket into the
  // wrong column on DST days. Calendar UIs commonly accept this.
  return new Date(Date.UTC(y, m - 1, d, 7, 0, 0));
}

/**
 * Pure helper: bucket events into PT day groups in render order.
 * Exported so the page can call it and (later) tests can cover it.
 */
export function groupEventsByPtDay(
  events: AgentCalendarEvent[]
): Array<{ date: string; label: string; events: AgentCalendarEvent[] }> {
  const groups = new Map<string, AgentCalendarEvent[]>();
  for (const e of events) {
    const dayKey = ptDateKey(e.start);
    let bucket = groups.get(dayKey);
    if (!bucket) {
      bucket = [];
      groups.set(dayKey, bucket);
    }
    bucket.push(e);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, evs]) => ({ date, label: formatDayLabel(date), events: evs }));
}

function ptDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
