import "server-only";
import { inArray, eq } from "drizzle-orm";
import {
  db,
  calendarEvents,
  engagements,
  meetingPrepBriefs,
} from "@strvx/db";

export type CalendarAgentOverlay = {
  engagementId: string | null;
  engagementName: string | null;
  hasPrepBrief: boolean;
};

export type OverlayLookup = {
  /** UI event id — bare DB UUID or `gcal-<google_event_id>`. */
  id: string;
  /** Google Calendar event id, if known (from DB row or `gcal-` prefix). */
  googleEventId: string | null;
  /** Engagement id already known from a DB row, if any. */
  engagementId?: string | null;
};

/**
 * Resolve engagement linkage + prep-brief presence for a heterogeneous
 * mix of events. DB-stored events carry their own `engagementId` and
 * `googleEventId` straight from the row; Google-fetched events only have
 * a `gcal-<id>` UI id. Both shapes are looked up by `google_event_id`
 * in `meeting_prep_briefs`, and engagement names are joined when an id
 * is present. Missing rows fall back gracefully.
 */
export async function loadCalendarAgentOverlays(
  events: OverlayLookup[]
): Promise<Map<string, CalendarAgentOverlay>> {
  const result = new Map<string, CalendarAgentOverlay>();
  if (events.length === 0) return result;

  const googleEventIds = Array.from(
    new Set(
      events
        .map((e) => e.googleEventId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const engagementIds = Array.from(
    new Set(
      events
        .map((e) => e.engagementId ?? null)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [briefRows, engagementRows, joinedRows] = await Promise.all([
    googleEventIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ calendarEventId: meetingPrepBriefs.calendarEventId })
          .from(meetingPrepBriefs)
          .where(inArray(meetingPrepBriefs.calendarEventId, googleEventIds)),
    engagementIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: engagements.id, name: engagements.name })
          .from(engagements)
          .where(inArray(engagements.id, engagementIds)),
    googleEventIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            googleEventId: calendarEvents.googleEventId,
            engagementId: calendarEvents.engagementId,
            engagementName: engagements.name,
          })
          .from(calendarEvents)
          .leftJoin(
            engagements,
            eq(engagements.id, calendarEvents.engagementId)
          )
          .where(inArray(calendarEvents.googleEventId, googleEventIds)),
  ]);

  const briefSet = new Set(briefRows.map((r) => r.calendarEventId));
  const engagementNameById = new Map(
    engagementRows.map((r) => [r.id, r.name])
  );
  const linkageByGoogleId = new Map(
    joinedRows
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

  for (const event of events) {
    const hasPrepBrief =
      event.googleEventId !== null && event.googleEventId !== undefined
        ? briefSet.has(event.googleEventId)
        : false;

    // Engagement: prefer the DB row's own engagement_id, then fall back to
    // the Google-event-id lookup join.
    let engagementId: string | null = event.engagementId ?? null;
    let engagementName: string | null = engagementId
      ? engagementNameById.get(engagementId) ?? null
      : null;
    if (!engagementId && event.googleEventId) {
      const linked = linkageByGoogleId.get(event.googleEventId);
      if (linked) {
        engagementId = linked.engagementId;
        engagementName = linked.engagementName;
      }
    }

    if (!engagementId && !hasPrepBrief) continue;
    result.set(event.id, {
      engagementId,
      engagementName,
      hasPrepBrief,
    });
  }

  return result;
}
