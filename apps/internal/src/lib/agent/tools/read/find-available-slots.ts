import { eq } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { z } from "zod";
import { db as defaultDb, agentSettings } from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  duration_minutes: z.number().int().min(15).max(240),
  lookahead_days: z.number().int().min(1).max(30).default(10),
  earliest_start_after: z.string().datetime().optional(),
  attendee_emails: z.array(z.string().email()).max(10).default([]),
});

const PT_ZONE = "America/Los_Angeles";
const TARGET_SLOTS = 3;

/** Defaults applied when no `agent_settings` row exists for the mailbox. */
export const DEFAULT_SCHEDULING_SETTINGS = {
  workingStartHour: 9,
  workingEndHour: 17,
  workingDays: [1, 2, 3, 4, 5] as number[], // Mon–Fri
  bufferMinutes: 15,
  maxBackToBack: 3,
  timezone: "America/Los_Angeles",
} as const;

export type SchedulingSettings = {
  workingStartHour: number;
  workingEndHour: number;
  workingDays: number[];
  bufferMinutes: number;
  maxBackToBack: number;
  timezone: string;
};

/**
 * Load the per-mailbox `agent_settings` row, or fall back to defaults.
 * Single round-trip — cheap to call once per tool invocation.
 */
export async function loadSchedulingSettings(
  db: typeof defaultDb,
  mailboxId: string
): Promise<SchedulingSettings> {
  const [row] = await db
    .select({
      workingStartHour: agentSettings.workingStartHour,
      workingEndHour: agentSettings.workingEndHour,
      workingDays: agentSettings.workingDays,
      bufferMinutes: agentSettings.bufferMinutes,
      maxBackToBack: agentSettings.maxBackToBack,
      timezone: agentSettings.timezone,
    })
    .from(agentSettings)
    .where(eq(agentSettings.mailboxId, mailboxId))
    .limit(1);

  if (!row) {
    return { ...DEFAULT_SCHEDULING_SETTINGS, workingDays: [...DEFAULT_SCHEDULING_SETTINGS.workingDays] };
  }
  return {
    workingStartHour: row.workingStartHour,
    workingEndHour: row.workingEndHour,
    workingDays: row.workingDays,
    bufferMinutes: row.bufferMinutes,
    maxBackToBack: row.maxBackToBack,
    timezone: row.timezone,
  };
}

export type Slot = { start: string; end: string; timezone: "America/Los_Angeles" };

export type Busy = { start: Date; end: Date };

export type FindAvailableSlotsOk = {
  slots: Slot[];
  working_hours_pt: "09:00-17:00 Mon-Fri";
  buffer_minutes: 15;
  range: { start: string; end: string };
  warnings?: string[];
};

export type FindAvailableSlotsScopeMissing = {
  slots: [];
  error: "calendar_scope_missing";
  message: string;
  range: { start: string; end: string };
  working_hours_pt: "09:00-17:00 Mon-Fri";
  buffer_minutes: 15;
};

export type FindAvailableSlotsOutput =
  | FindAvailableSlotsOk
  | FindAvailableSlotsScopeMissing;

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

/**
 * Returns the PT calendar-date parts for an instant.
 * Uses Intl to avoid pulling in date-fns-tz.
 */
function ptParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun ... 6=Sat
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/**
 * Build a UTC Date for a wall-clock PT moment (year/month/day/hour/minute).
 * Strategy: probe — try UTC offset −7h, check if Intl reads back the same
 * wall clock; if not, retry with −8h. This handles DST without a library.
 */
export function ptWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number
): Date {
  for (const offsetHours of [7, 8]) {
    const candidate = new Date(
      Date.UTC(year, month - 1, day, hour + offsetHours, minute, 0, 0)
    );
    const back = ptParts(candidate);
    if (
      back.year === year &&
      back.month === month &&
      back.day === day &&
      back.hour === hour &&
      back.minute === minute
    ) {
      return candidate;
    }
  }
  // Fallback to −8h (PST) if both probes failed (shouldn't happen).
  return new Date(Date.UTC(year, month - 1, day, hour + 8, minute, 0, 0));
}

/**
 * Generate working-hour windows in PT across N days from `fromDate`.
 * Returns intervals in absolute UTC.
 *
 * Pass `settings` to override the default Mon-Fri 09:00-17:00 PT window.
 * Defaults retained for callsites that don't yet plumb a settings row.
 */
export function workingHourWindowsPT(
  fromDate: Date,
  days: number,
  settings: {
    workingStartHour: number;
    workingEndHour: number;
    workingDays: number[];
  } = {
    workingStartHour: DEFAULT_SCHEDULING_SETTINGS.workingStartHour,
    workingEndHour: DEFAULT_SCHEDULING_SETTINGS.workingEndHour,
    workingDays: [...DEFAULT_SCHEDULING_SETTINGS.workingDays],
  }
): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  const dayPredicate = new Set(settings.workingDays);
  // Walk PT calendar-days. Start from the PT date of fromDate.
  const startPt = ptParts(fromDate);
  let y = startPt.year;
  let m = startPt.month;
  let d = startPt.day;

  for (let i = 0; i < days; i++) {
    const dayStart = ptWallClockToUtc(y, m, d, settings.workingStartHour, 0);
    const dayEnd = ptWallClockToUtc(y, m, d, settings.workingEndHour, 0);
    const wd = ptParts(dayStart).weekday;
    if (dayPredicate.has(wd)) {
      windows.push({ start: dayStart, end: dayEnd });
    }
    // Increment one PT calendar day. Use ptWallClockToUtc with day+1 and
    // re-read to handle month/year rollover.
    const next = ptWallClockToUtc(y, m, d + 1, 0, 0);
    const np = ptParts(next);
    y = np.year;
    m = np.month;
    d = np.day;
  }
  return windows;
}

/**
 * Merge overlapping/touching intervals after expanding each by `bufferMs`.
 */
export function expandAndMergeBusy(busy: Busy[], bufferMs: number): Busy[] {
  if (busy.length === 0) return [];
  const expanded = busy
    .map((b) => ({
      start: new Date(b.start.getTime() - bufferMs),
      end: new Date(b.end.getTime() + bufferMs),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Busy[] = [expanded[0]];
  for (let i = 1; i < expanded.length; i++) {
    const last = merged[merged.length - 1];
    const cur = expanded[i];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

/**
 * Subtract sorted-merged busy intervals from a window. Returns free chunks.
 */
function subtractBusy(
  window: { start: Date; end: Date },
  mergedBusy: Busy[]
): Array<{ start: Date; end: Date }> {
  let chunks: Array<{ start: Date; end: Date }> = [
    { start: window.start, end: window.end },
  ];
  for (const b of mergedBusy) {
    const next: typeof chunks = [];
    for (const c of chunks) {
      if (b.end <= c.start || b.start >= c.end) {
        next.push(c);
        continue;
      }
      if (b.start > c.start) next.push({ start: c.start, end: b.start });
      if (b.end < c.end) next.push({ start: b.end, end: c.end });
    }
    chunks = next;
  }
  return chunks.filter((c) => c.end.getTime() > c.start.getTime());
}

function ptDayKey(d: Date): string {
  const p = ptParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Pure algorithm: compute available slots from busy intervals + counts.
 *
 * @param busy        Merged-or-unmerged busy intervals (UTC).
 * @param opts        Algorithm parameters.
 * @param now         Reference "now" — earliest_start_after defaults to now+24h.
 *
 * Returns up to 3 slots, spread across ≥3 different PT days if possible.
 */
export function computeAvailableSlots(
  busy: Busy[],
  opts: {
    durationMinutes: number;
    lookaheadDays: number;
    earliestStartAfter?: Date;
    eventCountByPtDay?: Record<string, number>;
    settings?: SchedulingSettings;
  },
  now: Date
): { slots: Slot[]; range: { start: string; end: string } } {
  const settings: SchedulingSettings = opts.settings ?? {
    ...DEFAULT_SCHEDULING_SETTINGS,
    workingDays: [...DEFAULT_SCHEDULING_SETTINGS.workingDays],
  };
  const earliestStart = opts.earliestStartAfter
    ? opts.earliestStartAfter
    : new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const windows = workingHourWindowsPT(earliestStart, opts.lookaheadDays, {
    workingStartHour: settings.workingStartHour,
    workingEndHour: settings.workingEndHour,
    workingDays: settings.workingDays,
  });
  const merged = expandAndMergeBusy(busy, settings.bufferMinutes * 60 * 1000);
  const durationMs = opts.durationMinutes * 60 * 1000;
  const counts = opts.eventCountByPtDay ?? {};

  const slotsByDay: Record<string, Slot> = {};

  for (const win of windows) {
    // Clip window by earliestStart on its start side.
    const effStart =
      win.start.getTime() < earliestStart.getTime() ? earliestStart : win.start;
    if (effStart.getTime() >= win.end.getTime()) continue;

    const dayKey = ptDayKey(win.start);
    if ((counts[dayKey] ?? 0) >= settings.maxBackToBack) continue;
    if (slotsByDay[dayKey]) continue; // already picked the earliest slot for this day

    const free = subtractBusy({ start: effStart, end: win.end }, merged);
    for (const chunk of free) {
      if (chunk.end.getTime() - chunk.start.getTime() >= durationMs) {
        const slotEnd = new Date(chunk.start.getTime() + durationMs);
        slotsByDay[dayKey] = {
          start: chunk.start.toISOString(),
          end: slotEnd.toISOString(),
          timezone: PT_ZONE,
        };
        break;
      }
    }
  }

  // Sort by start time, take up to TARGET_SLOTS across distinct days.
  const slots = Object.values(slotsByDay)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, TARGET_SLOTS);

  // Compute range — earliestStart to the end of the last window we considered.
  const rangeEnd =
    windows.length > 0
      ? windows[windows.length - 1].end
      : new Date(
          earliestStart.getTime() + opts.lookaheadDays * 24 * 60 * 60 * 1000
        );

  return {
    slots,
    range: {
      start: earliestStart.toISOString(),
      end: rangeEnd.toISOString(),
    },
  };
}

type FreeBusyArgs = {
  calendar: calendar_v3.Calendar;
  timeMin: string;
  timeMax: string;
  attendees: string[];
};

/**
 * Fetch busy intervals via Google's freebusy.query API. Tolerates per-attendee
 * 403/404 errors (external attendees won't share) — collects busy data we
 * could read + a warnings array.
 */
export async function fetchFreeBusy(
  args: FreeBusyArgs
): Promise<{ busy: Busy[]; warnings: string[] }> {
  const { calendar, timeMin, timeMax, attendees } = args;
  const items = [{ id: "primary" }, ...attendees.map((id) => ({ id }))];
  const resp = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items },
  });
  const calendars = resp.data.calendars ?? {};
  const busy: Busy[] = [];
  const warnings: string[] = [];
  for (const [calId, info] of Object.entries(calendars)) {
    const errors = (info as calendar_v3.Schema$FreeBusyCalendar).errors;
    if (errors && errors.length > 0) {
      warnings.push(
        `Could not read busy data for ${calId}: ${errors.map((e) => e.reason ?? "unknown").join(",")}`
      );
      continue;
    }
    const periods = (info as calendar_v3.Schema$FreeBusyCalendar).busy ?? [];
    for (const p of periods) {
      if (p.start && p.end) {
        busy.push({ start: new Date(p.start), end: new Date(p.end) });
      }
    }
  }
  return { busy, warnings };
}

export const findAvailableSlotsTool: ToolDefinition<
  z.infer<typeof inputSchema>,
  FindAvailableSlotsOutput | { error: string; message?: string }
> = {
  name: "find_available_slots",
  description:
    "Returns up to 3 meeting slots that respect Mon-Fri 09:00-17:00 PT working hours, a 15-minute buffer around existing events, and a 3-meetings-per-day cap. Spread across ≥3 different days when possible. Pass attendee_emails to merge their busy data via freebusy.",
  inputSchema,
  async handle(input, ctx) {
    const safe = await getAuthedMailboxClientSafe(ctx.mailboxId);
    if (!safe.ok) {
      if (safe.error === "transient") {
        throw new Error(
          `find_available_slots: transient OAuth failure: ${safe.message}`
        );
      }
      if (safe.error === "disconnected") {
        return {
          error: "mailbox_disconnected",
          message: safe.message,
        };
      }
      return {
        error: "mailbox_not_found",
        message: safe.message,
      };
    }
    const client = safe.client;
    const email: string = safe.email;
    const settings = await loadSchedulingSettings(
      (ctx.db as typeof defaultDb) ?? defaultDb,
      ctx.mailboxId
    );
    const calendar = google.calendar({ version: "v3", auth: client });
    const now = new Date();
    const earliestStart = input.earliest_start_after
      ? new Date(input.earliest_start_after)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const windows = workingHourWindowsPT(
      earliestStart,
      input.lookahead_days,
      {
        workingStartHour: settings.workingStartHour,
        workingEndHour: settings.workingEndHour,
        workingDays: settings.workingDays,
      }
    );
    const rangeEnd =
      windows.length > 0
        ? windows[windows.length - 1].end
        : new Date(
            earliestStart.getTime() + input.lookahead_days * 24 * 60 * 60 * 1000
          );

    let busy: Busy[] = [];
    let warnings: string[] = [];
    try {
      const fb = await fetchFreeBusy({
        calendar,
        timeMin: earliestStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        attendees: input.attendee_emails,
      });
      busy = fb.busy;
      warnings = fb.warnings;
    } catch (err) {
      if (isScopeMissingError(err)) {
        return {
          slots: [],
          error: "calendar_scope_missing",
          message: `Mailbox ${email} hasn't granted calendar access yet — reconnect via /agent/settings?tab=mailboxes.`,
          range: {
            start: earliestStart.toISOString(),
            end: rangeEnd.toISOString(),
          },
          working_hours_pt: "09:00-17:00 Mon-Fri",
          buffer_minutes: 15,
        };
      }
      throw err;
    }

    // Count events per PT day for the max-back-to-back cap. Counting raw
    // busy intervals would double-count any meeting that appears on both the
    // primary calendar and an attendee's calendar — a single 2-attendee
    // meeting would be 3 events. Merge concurrent/overlapping blocks first
    // (without buffer) so each real meeting counts once.
    const dedupedForCount = expandAndMergeBusy(busy, 0);
    const eventCountByPtDay: Record<string, number> = {};
    for (const b of dedupedForCount) {
      const key = ptDayKey(b.start);
      eventCountByPtDay[key] = (eventCountByPtDay[key] ?? 0) + 1;
    }

    const { slots, range } = computeAvailableSlots(
      busy,
      {
        settings,
        durationMinutes: input.duration_minutes,
        lookaheadDays: input.lookahead_days,
        earliestStartAfter: earliestStart,
        eventCountByPtDay,
      },
      now
    );

    const out: FindAvailableSlotsOk = {
      slots,
      working_hours_pt: "09:00-17:00 Mon-Fri",
      buffer_minutes: 15,
      range,
    };
    if (warnings.length > 0) out.warnings = warnings;
    return out;
  },
};
