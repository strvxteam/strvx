import { google } from "googleapis";
import { getMeetingLabel } from "./meeting-types";

const TIMEZONE = "America/Los_Angeles";
const BUSINESS_HOURS_START = 10; // 10 AM Pacific — earliest bookable time
const BUSINESS_HOURS_END = 21;   // 9 PM Pacific
const SLOT_DURATION_MINUTES = 30;

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(memberId: string): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent", // force account picker so each member connects their OWN calendar
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state: memberId,
  });
}

export async function handleOAuthCallback(code: string) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type BusySlot = { start: string; end: string };

export type AvailableSlot = {
  start: Date;
  end: Date;
  availableMembers: string[]; // member IDs
  allAvailable: boolean;
};

const BUFFER_MS = 10 * 60 * 1000; // 10-minute buffer around each busy slot

// ── FreeBusy ─────────────────────────────────────────────────────────────────

async function getMemberCalendarIds(calendar: ReturnType<typeof google.calendar>): Promise<string[]> {
  try {
    const res = await calendar.calendarList.list({ minAccessRole: "freeBusyReader" });
    const ids = res.data.items?.map((c) => c.id!).filter(Boolean) ?? [];
    return ids.length > 0 ? ids : ["primary"];
  } catch {
    return ["primary"];
  }
}

// Queries ALL calendars accessible to the shared team account (strvxteam@gmail.com),
// which includes any personal calendars Alex/Nick have shared with it.
// This is the single source of truth for booking availability.
export async function getSharedCalendarBusyTimes(
  timeMin: Date,
  timeMax: Date,
  bufferMs: number = BUFFER_MS
): Promise<BusySlot[]> {
  const teamRefreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN;
  if (!teamRefreshToken) {
    throw new Error("GOOGLE_TEAM_REFRESH_TOKEN is not set");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: teamRefreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // All calendars accessible to the team account — includes shared personal calendars
  const calendarIds = await getMemberCalendarIds(calendar);
  console.log(`[availability] querying ${calendarIds.length} calendar(s):`, calendarIds);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: TIMEZONE,
      items: calendarIds.map((id) => ({ id })),
    },
  });

  const allBusy: BusySlot[] = [];
  for (const calId of calendarIds) {
    const busy = res.data.calendars?.[calId]?.busy ?? [];
    for (const b of busy) {
      if (!b.start || !b.end) continue;
      allBusy.push({
        start: new Date(new Date(b.start).getTime() - bufferMs).toISOString(),
        end: new Date(new Date(b.end).getTime() + bufferMs).toISOString(),
      });
    }
  }

  return allBusy;
}

// ── Availability calculation ──────────────────────────────────────────────────

function isMemberFree(memberId: string, slotStart: Date, slotEnd: Date, busyMap: Map<string, BusySlot[]>): boolean {
  const busySlots = busyMap.get(memberId) ?? [];
  const start = slotStart.getTime();
  const end = slotEnd.getTime();

  return !busySlots.some((b) => {
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    // Overlaps if slot start < busy end AND slot end > busy start
    return start < bEnd && end > bStart;
  });
}

const pacificFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

function getPacificParts(date: Date) {
  const parts = pacificFormatter.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    hour: parseInt(get("hour"), 10),   // 0–23, reliable with "2-digit" + hour12:false
    minute: parseInt(get("minute"), 10),
    weekday: get("weekday"),           // "Mon", "Tue", etc.
  };
}

// Returns decimal hour in Pacific time, e.g. 9:30 AM → 9.5, 9:00 PM → 21.0, 9:30 PM → 21.5
function toPacificDecimalHour(date: Date): number {
  const { hour, minute } = getPacificParts(date);
  return hour + minute / 60;
}

export function calculateAvailability(
  busyMap: Map<string, BusySlot[]>,
  memberIds: string[],
  dateStart: Date,
  dateEnd: Date,
  slotDurationMinutes: number = SLOT_DURATION_MINUTES,
  minRequired: number = 3,
  businessHoursEnd: number = BUSINESS_HOURS_END
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const stepMs = slotDurationMinutes * 60 * 1000;

  // Align cursor to next full 30-min boundary from epoch
  let cursor = new Date(Math.ceil(dateStart.getTime() / stepMs) * stepMs);

  while (cursor < dateEnd) {
    const slotEnd = new Date(cursor.getTime() + stepMs);
    if (slotEnd > dateEnd) break;

    const decimalHour = toPacificDecimalHour(cursor);
    const decimalHourEnd = toPacificDecimalHour(slotEnd);

    if (decimalHour >= BUSINESS_HOURS_START && decimalHour < businessHoursEnd && decimalHourEnd <= businessHoursEnd) {
      const availableMembers = memberIds.filter((id) =>
        isMemberFree(id, cursor, slotEnd, busyMap)
      );

      if (availableMembers.length >= minRequired) {
        slots.push({
          start: new Date(cursor),
          end: new Date(slotEnd),
          availableMembers,
          allAvailable: availableMembers.length === memberIds.length,
        });
      }
    }

    cursor = new Date(cursor.getTime() + stepMs);
  }

  return slots;
}

const WEEKDAY_NAMES = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

// Simple slot generator against a flat busy list (used with getSharedCalendarBusyTimes).
// A slot is returned only if it has zero overlap with any busy period.
// Set weekdaysOnly=true to skip Saturday and Sunday (Pacific time).
export function calculateSlotsFromBusy(
  busySlots: BusySlot[],
  dateStart: Date,
  dateEnd: Date,
  slotDurationMinutes: number = SLOT_DURATION_MINUTES,
  businessHoursEnd: number = BUSINESS_HOURS_END,
  stepMinutes?: number,
  weekdaysOnly: boolean = false
): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = [];
  const slotMs = slotDurationMinutes * 60 * 1000;
  const stepMs = (stepMinutes ?? slotDurationMinutes) * 60 * 1000;

  let cursor = new Date(Math.ceil(dateStart.getTime() / stepMs) * stepMs);

  while (cursor < dateEnd) {
    const slotEnd = new Date(cursor.getTime() + slotMs);
    if (slotEnd > dateEnd) break;

    const parts = getPacificParts(cursor);
    const decimalHour = parts.hour + parts.minute / 60;
    const decimalHourEnd = toPacificDecimalHour(slotEnd);
    const isWeekday = WEEKDAY_NAMES.has(parts.weekday);

    if (
      decimalHour >= BUSINESS_HOURS_START &&
      decimalHour < businessHoursEnd &&
      decimalHourEnd <= businessHoursEnd &&
      (!weekdaysOnly || isWeekday)
    ) {
      const isFree = !busySlots.some((b) => {
        const bStart = new Date(b.start).getTime();
        const bEnd = new Date(b.end).getTime();
        return cursor.getTime() < bEnd && slotEnd.getTime() > bStart;
      });

      if (isFree) slots.push({ start: new Date(cursor), end: new Date(slotEnd) });
    }

    cursor = new Date(cursor.getTime() + stepMs);
  }

  return slots;
}

// ── Event creation ────────────────────────────────────────────────────────────

type BookingDetails = {
  clientName: string;
  clientEmail: string;
  startTime: Date;
  endTime: Date;
  serviceType: string;
  // Optional extra attendees added to the calendar event invite — used for
  // partner bookings to put the partner on the meeting alongside the booker.
  extraAttendees?: Array<{ email: string; displayName?: string }>;
};

// Creates ONE event on the shared team calendar using GOOGLE_TEAM_REFRESH_TOKEN.
export async function createCalendarEvent(
  booking: BookingDetails
): Promise<{ eventId: string; meetLink: string | null }> {
  const teamCalendarId = process.env.TEAM_CALENDAR_ID ?? "strvxteam@gmail.com";
  const teamRefreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN;

  if (!teamRefreshToken) {
    throw new Error("GOOGLE_TEAM_REFRESH_TOKEN is not set — connect strvxteam@gmail.com via OAuth");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: teamRefreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const requestId = `strvx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const isInPerson = booking.serviceType === "in_person";
  const eventLabel = booking.serviceType === "discovery"
    ? "Discovery Call"
    : getMeetingLabel(booking.serviceType);
  const descriptionType = booking.serviceType === "discovery"
    ? "discovery call"
    : eventLabel.toLowerCase();

  let event;
  try {
    event = await calendar.events.insert({
      calendarId: teamCalendarId,
      ...(isInPerson ? {} : { conferenceDataVersion: 1 }),
      // Send Google's native "X invited you" email to the attendee on top of
      // our Resend confirmation, so the event auto-lands on their calendar.
      sendUpdates: "all",
      requestBody: {
        summary: `${eventLabel} — ${booking.clientName}`,
        description: `strvx ${descriptionType} with ${booking.clientName} (${booking.clientEmail}).`,
        start: { dateTime: booking.startTime.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: booking.endTime.toISOString(), timeZone: TIMEZONE },
        attendees: [
          {
            email: booking.clientEmail,
            displayName: booking.clientName,
          },
          ...(booking.extraAttendees ?? []).map((a) => ({
            email: a.email,
            ...(a.displayName ? { displayName: a.displayName } : {}),
          })),
        ],
        ...(isInPerson
          ? {}
          : {
              conferenceData: {
                createRequest: {
                  requestId,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            }),
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 },
            { method: "popup", minutes: 30 },
          ],
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalid_grant/i.test(msg)) {
      console.error(
        "[createCalendarEvent] GOOGLE_TEAM_REFRESH_TOKEN is expired or revoked. " +
        "Re-authenticate strvxteam@gmail.com by visiting: " +
        `/api/auth/google/team-connect?secret=<ADMIN_SECRET>`
      );
      throw new Error("Calendar authentication expired — please contact team@strvx.com");
    }
    throw err;
  }

  const eventId = event.data.id!;
  const meetLink =
    event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
    event.data.hangoutLink ??
    null;

  return { eventId, meetLink };
}

// ── Event cancellation ────────────────────────────────────────────────────────

export async function cancelCalendarEvent(
  eventId: string
): Promise<void> {
  const teamCalendarId = process.env.TEAM_CALENDAR_ID ?? "strvxteam@gmail.com";
  const teamRefreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN;

  if (!teamRefreshToken) throw new Error("GOOGLE_TEAM_REFRESH_TOKEN is not set");

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: teamRefreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  await calendar.events.delete({ calendarId: teamCalendarId, eventId });
}
