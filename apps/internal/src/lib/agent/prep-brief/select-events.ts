import type { calendar_v3 } from "googleapis";

/**
 * A pared-down Google Calendar event shape — exactly what the prep-brief
 * pipeline needs out of `calendar.events.list`. Defined explicitly so the
 * helper is straightforward to unit-test without importing googleapis types.
 */
export type PrepEvent = Pick<
  calendar_v3.Schema$Event,
  "id" | "summary" | "start" | "end" | "attendees" | "status" | "description"
>;

export type SelectEventsArgs = {
  /** Events returned by `calendar.events.list` (already PT-window filtered). */
  events: PrepEvent[];
  /**
   * Set of `calendar_event_id` values that already have a `meeting_prep_briefs`
   * row. Events whose id is in this set are skipped (idempotency).
   */
  existingBriefIds: Set<string>;
  /** "strvx.com" — used to bucket attendees as internal vs external. */
  ourDomain: string;
};

/**
 * Pure filter: returns the subset of `events` that need a prep brief generated.
 *
 * An event qualifies when ALL of the following hold:
 *   - it has a usable `id`
 *   - it is not cancelled (`status !== "cancelled"`)
 *   - it has at least one attendee whose email domain is NOT `ourDomain`
 *     (i.e. there's someone external on the invite)
 *   - it does not already appear in `existingBriefIds`
 *
 * Results are sorted ascending by event start time so the cron processes the
 * soonest meeting first — minimising the chance that a meeting starts before
 * its brief is written.
 */
export function selectEventsNeedingBrief(
  args: SelectEventsArgs
): PrepEvent[] {
  const { events, existingBriefIds, ourDomain } = args;
  const domain = ourDomain.toLowerCase();

  const filtered = events.filter((e) => {
    if (!e.id) return false;
    if (e.status === "cancelled") return false;
    if (existingBriefIds.has(e.id)) return false;

    const attendees = e.attendees ?? [];
    const hasExternal = attendees.some((a) => {
      const email = (a.email ?? "").toLowerCase();
      if (!email.includes("@")) return false;
      const at = email.lastIndexOf("@");
      const attendeeDomain = email.slice(at + 1);
      return attendeeDomain !== domain;
    });
    return hasExternal;
  });

  return filtered.sort((a, b) => startMs(a) - startMs(b));
}

function startMs(e: PrepEvent): number {
  const s = e.start;
  if (!s) return Number.POSITIVE_INFINITY;
  const iso = s.dateTime ?? s.date;
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}
