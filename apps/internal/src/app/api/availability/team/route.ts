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
  { email: "alex.battikha@gmail.com", name: "Alex", color: "#1a73e8" },
  { email: "ndossantos@ucsd.edu", name: "Nick", color: "#0f9d58" },
  { email: "hariharan7natarajan@gmail.com", name: "Hari", color: "#e91e63" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemberEvent = {
  id: string;
  title: string;
  start: string; // ISO datetime or date
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
};

// ── Google Calendar fetch ─────────────────────────────────────────────────────

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

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return (res.data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id ?? crypto.randomUUID(),
      title: e.summary ?? "(No title)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      isAllDay: !e.start?.dateTime,
      meetLink:
        e.hangoutLink ??
        e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
        null,
    }));
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

  // Fetch user DB rows for the team members
  const emails = TEAM_MEMBERS.map((m) => m.email);
  const memberRows = await db
    .select({
      id: users.id,
      email: users.email,
      googleRefreshToken: users.googleRefreshToken,
    })
    .from(users)
    .where(inArray(users.email, emails));

  // Also check google_tokens table (set via internal OAuth flow)
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
      const refreshToken = row
        ? (tokenByUserId.get(row.id) ?? row.googleRefreshToken ?? null)
        : null;

      let events: MemberEvent[] = [];
      if (refreshToken) {
        try {
          events = await fetchEventsWithRefreshToken(refreshToken, start, end);
        } catch (err) {
          console.error(`[team/availability] Failed to fetch events for ${member.email}:`, err);
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

  return NextResponse.json({ members } satisfies TeamAvailabilityResponse);
}
