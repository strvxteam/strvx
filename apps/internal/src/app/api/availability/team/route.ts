export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { googleTokens } from "@/lib/google-calendar";
import { google } from "googleapis";
import { inArray } from "drizzle-orm";

// ── Team member config ────────────────────────────────────────────────────────

export const TEAM_MEMBERS = [
  { email: "alex@strvx.com", name: "Alex", color: "#1a73e8" },
  { email: "strvxteam@strvx.com", name: "Nick", color: "#0f9d58" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemberEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  meetLink: string | null;
};

export type TeamMemberAvailability = {
  id: string;
  name: string;
  email: string;
  color: string;
  connected: boolean;
  events: MemberEvent[];
};

export type TeamAvailabilityResponse = {
  members: TeamMemberAvailability[];
  currentUserEmail: string | null;
};

// ── Google Calendar fetch (all calendars, deduplicated) ───────────────────────

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

async function fetchEventsWithRefreshToken(
  refreshToken: string,
  timeMin: string,
  timeMax: string,
): Promise<MemberEvent[]> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Get all calendars this account can read
  let calendarIds: string[] = ["primary"];
  try {
    const calList = await calendar.calendarList.list({ minAccessRole: "freeBusyReader" });
    const ids = (calList.data.items ?? []).map((c) => c.id!).filter(Boolean);
    if (ids.length > 0) calendarIds = ids;
  } catch {
    // fall back to primary only
  }

  // Fetch events from all calendars in parallel, deduplicate by iCalUID
  const seenUids = new Set<string>();
  const allEvents: MemberEvent[] = [];

  await Promise.all(
    calendarIds.map(async (calId) => {
      try {
        const res = await calendar.events.list({
          calendarId: calId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        });

        for (const e of res.data.items ?? []) {
          if (e.status === "cancelled") continue;

          // Deduplicate by instance ID (not iCalUID — recurring events share iCalUID
          // across all instances, so using iCalUID would drop Wed/Fri of a Mon/Wed/Fri series).
          // e.id is unique per instance AND per calendar, so it correctly deduplicates
          // the same event instance that appears in multiple of this user's calendars.
          const uid = e.id ?? e.iCalUID ?? "";
          if (uid && seenUids.has(uid)) continue;
          if (uid) seenUids.add(uid);

          allEvents.push({
            id: e.id ?? crypto.randomUUID(),
            title: e.summary ?? "(No title)",
            start: e.start?.dateTime ?? e.start?.date ?? "",
            end: e.end?.dateTime ?? e.end?.date ?? "",
            isAllDay: !e.start?.dateTime,
            meetLink:
              e.hangoutLink ??
              e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
              null,
          });
        }
      } catch (err) {
        console.error(`[team/availability] Failed to fetch cal ${calId}:`, err);
      }
    }),
  );

  return allEvents;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  // Look up DB users for the team
  const emails = TEAM_MEMBERS.map((m) => m.email);
  const memberRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, emails));

  // Only use google_tokens (personal calendar tokens set via internal OAuth).
  // Do NOT fall back to users.google_refresh_token — that column stores the shared
  // team calendar token for all members and causes events to appear under wrong names.
  const userIds = memberRows.map((r) => r.id);
  const tokenRows =
    userIds.length > 0
      ? await db
          .select({ userId: googleTokens.userId, refreshToken: googleTokens.refreshToken })
          .from(googleTokens)
          .where(inArray(googleTokens.userId, userIds))
      : [];

  const tokenByUserId = new Map(tokenRows.map((t) => [t.userId, t.refreshToken]));
  const userByEmail = new Map(memberRows.map((r) => [r.email, r]));

  // Fetch events for each team member in parallel
  const members = await Promise.all(
    TEAM_MEMBERS.map(async (member) => {
      const row = userByEmail.get(member.email);
      const refreshToken = row ? (tokenByUserId.get(row.id) ?? null) : null;

      let events: MemberEvent[] = [];
      if (refreshToken) {
        try {
          events = await fetchEventsWithRefreshToken(refreshToken, start, end);
        } catch (err) {
          console.error(`[team/availability] Failed for ${member.email}:`, err);
        }
      }

      return {
        id: row?.id ?? member.email,
        name: member.name,
        email: member.email,
        color: member.color,
        connected: !!refreshToken,
        events,
      } satisfies TeamMemberAvailability;
    }),
  );

  return NextResponse.json({ members, currentUserEmail: user.email ?? null } satisfies TeamAvailabilityResponse);
}
