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

/**
 * Given an array of event ids — either `gcal-<googleEventId>` (from a
 * Google Calendar fetch) or raw DB ids — return overlay data per id:
 * engagement linkage (via calendar_events.google_event_id) and prep-brief
 * presence (via meeting_prep_briefs.calendar_event_id).
 *
 * Missing rows fall back to nulls/false so the UI degrades gracefully.
 */
export async function loadCalendarAgentOverlays(
  ids: string[]
): Promise<Map<string, CalendarAgentOverlay>> {
  const result = new Map<string, CalendarAgentOverlay>();
  if (ids.length === 0) return result;

  const googleEventIds = ids
    .filter((id) => id.startsWith("gcal-"))
    .map((id) => id.slice("gcal-".length));

  if (googleEventIds.length === 0) return result;

  const [engagementRows, briefRows] = await Promise.all([
    db
      .select({
        googleEventId: calendarEvents.googleEventId,
        engagementId: calendarEvents.engagementId,
        engagementName: engagements.name,
      })
      .from(calendarEvents)
      .leftJoin(engagements, eq(engagements.id, calendarEvents.engagementId))
      .where(inArray(calendarEvents.googleEventId, googleEventIds)),
    db
      .select({ calendarEventId: meetingPrepBriefs.calendarEventId })
      .from(meetingPrepBriefs)
      .where(inArray(meetingPrepBriefs.calendarEventId, googleEventIds)),
  ]);

  const briefSet = new Set(briefRows.map((r) => r.calendarEventId));

  for (const row of engagementRows) {
    if (!row.googleEventId) continue;
    result.set(`gcal-${row.googleEventId}`, {
      engagementId: row.engagementId,
      engagementName: row.engagementName,
      hasPrepBrief: briefSet.has(row.googleEventId),
    });
  }

  // Cover IDs with a brief but no engagement linkage.
  for (const googleEventId of briefSet) {
    const id = `gcal-${googleEventId}`;
    if (result.has(id)) continue;
    result.set(id, {
      engagementId: null,
      engagementName: null,
      hasPrepBrief: true,
    });
  }

  return result;
}
