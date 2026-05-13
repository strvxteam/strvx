import { and, eq, inArray } from "drizzle-orm";
import type { db as DbType } from "@strvx/db";
import { followUpWatchers } from "@strvx/db";

export type SchedulePostMeetingInput = {
  db: typeof DbType;
  /** Google Calendar event id (string passes through; not the calendar_events.id uuid). */
  calendarEventId: string;
  /** Optional engagement to link the watcher to. */
  engagementId?: string | null;
  /** Optional thread to link the watcher to. */
  threadId?: string | null;
  /** Event's end timestamp; the watcher fires at `eventEndAt + 1h`. */
  eventEndAt: Date | string;
  /** Reserved for future tuning; ignored today but kept to lock the API shape. */
  throttleEnabled?: boolean;
};

export type SchedulePostMeetingResult = {
  watcherId: string;
  alreadyExisted: boolean;
};

/**
 * Idempotently schedule a `post_meeting_followup` watcher for one calendar
 * event. Re-running for the same `calendarEventId` returns the existing
 * watcher's id when it's still pending/fired — we never duplicate. Cancelled
 * watchers are ignored (so we can re-arm after a manual cancel if needed).
 */
export async function schedulePostMeetingWatcher(
  input: SchedulePostMeetingInput
): Promise<SchedulePostMeetingResult> {
  const { db, calendarEventId } = input;
  if (!calendarEventId) {
    throw new Error("schedulePostMeetingWatcher: calendarEventId is required");
  }

  const endAt =
    input.eventEndAt instanceof Date
      ? input.eventEndAt
      : new Date(input.eventEndAt);
  if (Number.isNaN(endAt.getTime())) {
    throw new Error(
      `schedulePostMeetingWatcher: invalid eventEndAt: ${String(input.eventEndAt)}`
    );
  }
  const triggerAfter = new Date(endAt.getTime() + 60 * 60 * 1000); // +1 hour

  // Idempotency check: any pending/fired watcher for this event short-circuits.
  const [existing] = await db
    .select({ id: followUpWatchers.id })
    .from(followUpWatchers)
    .where(
      and(
        eq(followUpWatchers.calendarEventId, calendarEventId),
        eq(followUpWatchers.kind, "post_meeting_followup"),
        inArray(followUpWatchers.status, ["pending", "fired"])
      )
    )
    .limit(1);

  if (existing) {
    return { watcherId: existing.id, alreadyExisted: true };
  }

  const [inserted] = await db
    .insert(followUpWatchers)
    .values({
      kind: "post_meeting_followup",
      calendarEventId,
      engagementId: input.engagementId ?? null,
      threadId: input.threadId ?? null,
      triggerAfter,
      status: "pending",
      ruleConfig: {},
    })
    .returning({ id: followUpWatchers.id });

  return { watcherId: inserted.id, alreadyExisted: false };
}
