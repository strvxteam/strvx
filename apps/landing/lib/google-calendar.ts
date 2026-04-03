import { google } from "googleapis";
import type { TeamMember } from "./supabase";

const TIMEZONE = "America/Los_Angeles";
const BUSINESS_HOURS_START = 9;  // 9 AM Pacific
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
    prompt: "consent",
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

export async function getTeamBusyTimes(
  members: TeamMember[],
  timeMin: Date,
  timeMax: Date
): Promise<Map<string, BusySlot[]>> {
  const results = new Map<string, BusySlot[]>();

  await Promise.all(
    members.map(async (member) => {
      if (!member.google_refresh_token) {
        results.set(member.id, [{ start: timeMin.toISOString(), end: timeMax.toISOString() }]);
        return;
      }

      try {
        const oauth2Client = createOAuth2Client();
        oauth2Client.setCredentials({ refresh_token: member.google_refresh_token });

        const calendar = google.calendar({ version: "v3", auth: oauth2Client });

        // Fetch all calendars on this account, not just primary
        const calendarIds = await getMemberCalendarIds(calendar);

        const res = await calendar.freebusy.query({
          requestBody: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            timeZone: TIMEZONE,
            items: calendarIds.map((id) => ({ id })),
          },
        });

        // Merge busy slots from all calendars, then add 10-min buffer on each side
        const allBusy: BusySlot[] = [];
        for (const calId of calendarIds) {
          const busy = res.data.calendars?.[calId]?.busy ?? [];
          for (const b of busy) {
            if (!b.start || !b.end) continue;
            allBusy.push({
              start: new Date(new Date(b.start).getTime() - BUFFER_MS).toISOString(),
              end: new Date(new Date(b.end).getTime() + BUFFER_MS).toISOString(),
            });
          }
        }

        results.set(member.id, allBusy);
      } catch (err) {
        // On error, treat member as fully busy (safe fallback)
        console.error(`[getTeamBusyTimes] Failed for member ${member.name} (${member.email}):`, err);
        results.set(member.id, [{ start: timeMin.toISOString(), end: timeMax.toISOString() }]);
      }
    })
  );

  return results;
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
  minRequired: number = 3
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

    // Within business hours:
    // - decimalHour >= 9        → slot starts at or after 9 AM
    // - decimalHour < 21        → slot starts before 9 PM (excludes 9:00 PM start and midnight-wraparound slots)
    // - decimalHourEnd <= 21    → slot ends by 9 PM (21.5 correctly fails for a 9:30 PM end)
    if (decimalHour >= BUSINESS_HOURS_START && decimalHour < BUSINESS_HOURS_END && decimalHourEnd <= BUSINESS_HOURS_END) {
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

// ── Event creation ────────────────────────────────────────────────────────────

type BookingDetails = {
  clientName: string;
  clientEmail: string;
  startTime: Date;
  endTime: Date;
  serviceType: string;
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

  const event = await calendar.events.insert({
    calendarId: teamCalendarId,
    conferenceDataVersion: 1,
    sendUpdates: "none",
    requestBody: {
      summary: `Discovery Call — ${booking.clientName}`,
      description: `strvx discovery call with ${booking.clientName} (${booking.clientEmail}).`,
      start: { dateTime: booking.startTime.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: booking.endTime.toISOString(), timeZone: TIMEZONE },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    },
  });

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
