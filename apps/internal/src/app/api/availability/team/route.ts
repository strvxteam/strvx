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

// Each fetched event carries a stable cross-calendar dedup key plus a flag
// indicating whether it came from the user's primary calendar. We use both
// to dedup the same event appearing in multiple calendars (e.g. the strvx
// team calendar shared into Alex's account also being Nick's primary).
type FetchedEvent = MemberEvent & { uidKey: string; fromPrimary: boolean };

// Build a key that's stable for the same logical event across different
// calendars (so the strvx team event in Alex's shared view dedupes against
// the same event in Nick's primary view). iCalUID is RFC5545 globally
// unique; we append the instance start so recurring-series instances stay
// distinct (singleEvents: true expands the series, but they all share
// iCalUID).
function eventDedupKey(e: {
  iCalUID?: string | null;
  id?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
}): string {
  const uid = e.iCalUID ?? e.id ?? "";
  const start = e.start?.dateTime ?? e.start?.date ?? "";
  return `${uid}|${start}`;
}

async function fetchEventsWithRefreshToken(
  refreshToken: string,
  timeMin: string,
  timeMax: string,
): Promise<FetchedEvent[]> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Fetch the user's primary plus every calendar they OWN. minAccessRole=owner
  // filters out subscribed calendars (holidays, shared-read calendars, etc.)
  // and any shared calendar where they were granted writer/reader access. A
  // calendar shared with "owner" access still counts as owned — we rely on
  // the global cross-user dedup below to pick a single canonical owner for
  // such events.
  let secondaryCalendarIds: string[] = [];
  try {
    const listRes = await calendar.calendarList.list({
      minAccessRole: "owner",
      maxResults: 100,
    });
    secondaryCalendarIds = (listRes.data.items ?? [])
      .filter((c) => c.id && !c.primary)
      .map((c) => c.id!);
  } catch (err) {
    console.error("[team/availability] Failed to list calendars:", err);
  }

  const calendarSpecs: { id: string; isPrimary: boolean }[] = [
    { id: "primary", isPrimary: true },
    ...secondaryCalendarIds.map((id) => ({ id, isPrimary: false })),
  ];

  // Fetch every calendar in parallel, then dedup sequentially in primary-first
  // order so that the primary copy wins when the same event lives in both the
  // primary and a shared secondary inside this user's view.
  const perCalendarItems = await Promise.all(
    calendarSpecs.map(async ({ id: calId, isPrimary }) => {
      try {
        const res = await calendar.events.list({
          calendarId: calId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        });
        return { isPrimary, items: res.data.items ?? [] };
      } catch (err) {
        console.error(`[team/availability] Failed to fetch cal ${calId}:`, err);
        return { isPrimary, items: [] };
      }
    }),
  );

  const seenUserKeys = new Set<string>();
  const allEvents: FetchedEvent[] = [];
  // Two passes: primary calendars first, then secondaries.
  for (const wantPrimary of [true, false]) {
    for (const { isPrimary, items } of perCalendarItems) {
      if (isPrimary !== wantPrimary) continue;
      for (const e of items) {
        if (e.status === "cancelled") continue;
        const key = eventDedupKey(e);
        if (key && seenUserKeys.has(key)) continue;
        if (key) seenUserKeys.add(key);

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
          uidKey: key,
          fromPrimary: isPrimary,
        });
      }
    }
  }

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

  // Fetch each TEAM_MEMBER's PERSONAL events (their primary + owned secondaries
  // like Alex's tutoring) and the SHARED strvx team calendar
  // (strvxteam@gmail.com) in parallel. The shared calendar is fetched once via
  // GOOGLE_TEAM_REFRESH_TOKEN — the same env var the booking system uses — and
  // its events are merged into EVERY member's column. No cross-user dedup,
  // because team events are supposed to appear on both Alex and Nick.
  const memberOwnByEmail = new Map<string, FetchedEvent[]>();
  const tokenByEmail = new Map<string, string | null>();

  const memberFetches = TEAM_MEMBERS.map(async (member) => {
    const row = userByEmail.get(member.email);
    const refreshToken = row ? (tokenByUserId.get(row.id) ?? null) : null;
    tokenByEmail.set(member.email, refreshToken);
    if (!refreshToken) {
      memberOwnByEmail.set(member.email, []);
      return;
    }
    try {
      const events = await fetchEventsWithRefreshToken(refreshToken, start, end);
      memberOwnByEmail.set(member.email, events);
    } catch (err) {
      console.error(`[team/availability] Failed for ${member.email}:`, err);
      memberOwnByEmail.set(member.email, []);
    }
  });

  let teamSharedEvents: FetchedEvent[] = [];
  const teamRefreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN;
  const teamFetch = (async () => {
    if (!teamRefreshToken) {
      console.warn(
        "[team/availability] GOOGLE_TEAM_REFRESH_TOKEN not set — strvx team calendar events will not be shown",
      );
      return;
    }
    try {
      teamSharedEvents = await fetchEventsWithRefreshToken(teamRefreshToken, start, end);
    } catch (err) {
      console.error("[team/availability] Failed to fetch strvx team calendar:", err);
    }
  })();

  await Promise.all([...memberFetches, teamFetch]);

  // Build each member's final event list: their own events FIRST, then the
  // team-shared events. Within-member dedup keeps the personal copy when an
  // event lives in both — e.g. Alex was invited to a strvx team meeting, so
  // it's on his primary AND on the team calendar; the personal copy wins on
  // his column, and Nick gets it once via the team calendar.
  const members: TeamMemberAvailability[] = TEAM_MEMBERS.map((member) => {
    const row = userByEmail.get(member.email);
    const refreshToken = tokenByEmail.get(member.email) ?? null;
    const ownEvents = memberOwnByEmail.get(member.email) ?? [];

    const seenInMember = new Set<string>();
    const events: MemberEvent[] = [];
    const append = (e: FetchedEvent) => {
      if (e.uidKey && seenInMember.has(e.uidKey)) return;
      if (e.uidKey) seenInMember.add(e.uidKey);
      events.push({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        isAllDay: e.isAllDay,
        meetLink: e.meetLink,
      });
    };
    ownEvents.forEach(append);
    teamSharedEvents.forEach(append);

    return {
      id: row?.id ?? member.email,
      name: member.name,
      email: member.email,
      color: member.color,
      connected: !!refreshToken,
      events,
    };
  });

  return NextResponse.json({ members, currentUserEmail: user.email ?? null } satisfies TeamAvailabilityResponse);
}
