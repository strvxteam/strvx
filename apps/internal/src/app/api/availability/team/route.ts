export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { google } from "googleapis";
import { inArray } from "drizzle-orm";

// ── Team member config ────────────────────────────────────────────────────────
//
// The availability view is read entirely through ONE OAuth account:
// strvxteam@gmail.com (GOOGLE_TEAM_REFRESH_TOKEN). Alex and Nick have shared
// their primary + side calendars with that account, so we list everything
// visible to it and classify each calendar back to its owner.
//
// Classification rules (first match wins):
//   1. calendar.id matches an alias in alex/nick/team aliases list → that member
//   2. calendar.summary contains a member's name pattern → that member
//   3. calendar.primary === true OR calendar.id is the team alias → "team"
//   4. fallback → "team" (visible to BOTH members)
//
// To attribute a side calendar correctly, add its calendar id (the email-ish
// string Google assigns when shared) to AVAILABILITY_ALEX_CALENDAR_IDS or
// AVAILABILITY_NICK_CALENDAR_IDS in Vercel. The server logs every visible
// calendar's id + summary on each request to make this easy to wire up.

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ALEX_ALIASES_ENV = parseCsv(process.env.AVAILABILITY_ALEX_CALENDAR_IDS);
const NICK_ALIASES_ENV = parseCsv(process.env.AVAILABILITY_NICK_CALENDAR_IDS);
const TEAM_ALIASES_ENV = parseCsv(process.env.AVAILABILITY_TEAM_CALENDAR_IDS);

// Reasonable defaults — same values can be overridden via env without code change.
const ALEX_ALIASES = new Set<string>([
  ...ALEX_ALIASES_ENV,
  "alex@strvx.com",
  "alex.battikha@gmail.com",
]);

const NICK_ALIASES = new Set<string>([
  ...NICK_ALIASES_ENV,
  "nick@strvx.com",
]);

const TEAM_ALIASES = new Set<string>([
  ...TEAM_ALIASES_ENV,
  "strvxteam@gmail.com",
  "strvxteam@strvx.com",
]);

const ALEX_SUMMARY_PATTERNS = ["alex"];
const NICK_SUMMARY_PATTERNS = ["nick", "nicolas"];
// Calendars owned/named for the team (e.g. "Strvx Bookings"). Events appear
// on BOTH members' columns. We deliberately do NOT include generic words like
// "team" — calendars unrelated to strvx (e.g. "Team USA basketball") would
// match and pollute both columns.
const TEAM_SUMMARY_PATTERNS = ["strvx"];

export const TEAM_MEMBERS = [
  { email: "alex@strvx.com", name: "Alex", color: "#1a73e8" },
  { email: "strvxteam@strvx.com", name: "Nick", color: "#0f9d58" },
] as const;

type MemberKey = "alex" | "nick";

const MEMBER_BY_KEY: Record<MemberKey, (typeof TEAM_MEMBERS)[number]> = {
  alex: TEAM_MEMBERS[0],
  nick: TEAM_MEMBERS[1],
};

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
  // Server diagnostic — list of visible calendars and how each was classified.
  // Useful for adding new side calendars to the env alias lists. "skip" =
  // calendar visible to strvxteam but not attributed to anyone (holidays etc.).
  calendars?: { id: string; summary: string; primary: boolean; accessRole: string; owner: MemberKey | "team" | "skip" }[];
};

// ── Calendar classification ───────────────────────────────────────────────────

// "skip" = the strvxteam account has this calendar in its list but it's not
// owned/shared by anyone on the team (holiday subs, weather, sports, random
// third-party shares). These get filtered out so they DON'T double-render
// across both members' columns.
type CalendarOwner = MemberKey | "team" | "skip";

function classifyCalendar(cal: {
  id?: string | null;
  summary?: string | null;
  summaryOverride?: string | null;
  primary?: boolean | null;
}): CalendarOwner {
  const id = (cal.id ?? "").toLowerCase();
  const summary = (cal.summary ?? "").toLowerCase();
  const summaryOverride = (cal.summaryOverride ?? "").toLowerCase();
  const effectiveName = summaryOverride || summary;

  // 1. Calendar id alias match (handles shared primaries where id === owner's email)
  if (id && ALEX_ALIASES.has(id)) return "alex";
  if (id && NICK_ALIASES.has(id)) return "nick";
  if (id && TEAM_ALIASES.has(id)) return "team";

  // 2. Strvxteam's own primary calendar — events that live on it are SHARED.
  if (cal.primary === true) return "team";

  // 3. Summary name match (for side calendars with hash IDs).
  // Check summaryOverride first since the team account might have renamed it locally.
  for (const p of ALEX_SUMMARY_PATTERNS) {
    if (effectiveName.includes(p)) return "alex";
  }
  for (const p of NICK_SUMMARY_PATTERNS) {
    if (effectiveName.includes(p)) return "nick";
  }
  for (const p of TEAM_SUMMARY_PATTERNS) {
    if (effectiveName.includes(p)) return "team";
  }

  // 4. Default — SKIP. Unclassified calendars (holidays, birthdays, weather,
  // sports subscriptions, random 3rd-party shares) would otherwise appear on
  // BOTH columns under a "team" fallback. Add an explicit alias via
  // AVAILABILITY_{ALEX,NICK,TEAM}_CALENDAR_IDS to opt one in.
  return "skip";
}

// ── Google Calendar fetch ─────────────────────────────────────────────────────

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// Stable dedup key for the same logical event across calendars.
// iCalUID is RFC5545-global; we append the instance start so expanded recurring
// instances stay distinct (singleEvents: true gives every instance the same
// iCalUID by design).
function eventDedupKey(e: {
  iCalUID?: string | null;
  id?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
}): string {
  const uid = e.iCalUID ?? e.id ?? "";
  const start = e.start?.dateTime ?? e.start?.date ?? "";
  return `${uid}|${start}`;
}

type ClassifiedEvent = MemberEvent & { uidKey: string; owner: CalendarOwner };

async function fetchAllVisibleEvents(
  refreshToken: string,
  timeMin: string,
  timeMax: string,
): Promise<{
  events: ClassifiedEvent[];
  calendars: { id: string; summary: string; primary: boolean; accessRole: string; owner: CalendarOwner }[];
}> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // List EVERY calendar the team account can read (its own + everything shared
  // with it). freeBusyReader is the lowest meaningful access level — includes
  // shared "reader" / "writer" / "owner" too.
  let calendarItems: {
    id?: string | null;
    summary?: string | null;
    summaryOverride?: string | null;
    primary?: boolean | null;
    accessRole?: string | null;
  }[] = [];
  try {
    const listRes = await calendar.calendarList.list({
      minAccessRole: "freeBusyReader",
      maxResults: 250,
    });
    calendarItems = listRes.data.items ?? [];
  } catch (err) {
    console.error("[team/availability] calendarList.list failed:", err);
    throw new Error("Could not list calendars from strvxteam@gmail.com");
  }

  // Classify each calendar.
  const classifiedCals = calendarItems
    .filter((c) => c.id)
    .map((c) => ({
      id: c.id!,
      summary: c.summary ?? c.summaryOverride ?? "(no name)",
      primary: c.primary === true,
      accessRole: c.accessRole ?? "unknown",
      owner: classifyCalendar(c),
    }));

  console.log(
    `[team/availability] strvxteam sees ${classifiedCals.length} calendar(s):\n` +
      classifiedCals
        .map(
          (c) =>
            `  - [${c.owner}] ${c.id} "${c.summary}" (primary=${c.primary}, role=${c.accessRole})`,
        )
        .join("\n"),
  );

  // Fetch events ONLY from calendars classified as alex/nick/team. Skipping
  // unclassified calendars (e.g. holiday subscriptions) avoids both wasted
  // API calls AND the "appears on both columns" doubling bug.
  const perCalendar = await Promise.all(
    classifiedCals
      .filter((cal) => cal.owner !== "skip")
      .map(async (cal) => {
        try {
          const res = await calendar.events.list({
            calendarId: cal.id,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
          });
          const items = res.data.items ?? [];
          return { cal, items };
        } catch (err) {
          console.error(`[team/availability] events.list failed for ${cal.id}:`, err);
          return { cal, items: [] };
        }
      }),
  );

  // Flatten into ClassifiedEvent[]. We DO NOT dedup here — a single Google
  // event in two calendars (e.g. strvxteam's primary + Alex's shared primary)
  // legitimately represents both an event Alex has AND a team event, and we
  // dedup per-member later when assembling each member's column.
  const events: ClassifiedEvent[] = [];
  for (const { cal, items } of perCalendar) {
    for (const e of items) {
      if (e.status === "cancelled") continue;
      const start = e.start?.dateTime ?? e.start?.date ?? "";
      const end = e.end?.dateTime ?? e.end?.date ?? "";
      if (!start || !end) continue;
      events.push({
        id: e.id ?? crypto.randomUUID(),
        title: e.summary ?? "(No title)",
        start,
        end,
        isAllDay: !e.start?.dateTime,
        meetLink:
          e.hangoutLink ??
          e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
          null,
        uidKey: eventDedupKey(e),
        owner: cal.owner,
      });
    }
  }

  return { events, calendars: classifiedCals };
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

  const teamRefreshToken = process.env.GOOGLE_TEAM_REFRESH_TOKEN;
  if (!teamRefreshToken) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_TEAM_REFRESH_TOKEN is not set — strvxteam@gmail.com calendar account is not connected.",
      },
      { status: 503 },
    );
  }

  // Look up DB user ids for the team — used for the `id` field in the response,
  // which the client uses as a stable member key for the link.
  const emails = TEAM_MEMBERS.map((m) => m.email);
  const memberRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, emails));
  const userByEmail = new Map(memberRows.map((r) => [r.email, r]));

  let fetched: Awaited<ReturnType<typeof fetchAllVisibleEvents>>;
  try {
    fetched = await fetchAllVisibleEvents(teamRefreshToken, start, end);
  } catch (err) {
    console.error("[team/availability] failed to fetch events:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch events from strvxteam@gmail.com",
      },
      { status: 502 },
    );
  }

  // Split events by owner. Team-classified events go on BOTH columns.
  // "skip" events should already be filtered out at fetch time, but we guard
  // again here so a future refactor that drops the fetch-time filter doesn't
  // accidentally re-introduce the doubling bug.
  const alexEvents: ClassifiedEvent[] = [];
  const nickEvents: ClassifiedEvent[] = [];
  for (const evt of fetched.events) {
    if (evt.owner === "alex") {
      alexEvents.push(evt);
    } else if (evt.owner === "nick") {
      nickEvents.push(evt);
    } else if (evt.owner === "team") {
      alexEvents.push(evt);
      nickEvents.push(evt);
    }
    // owner === "skip" → ignored
  }

  // Per-member dedup by uidKey (handles the case where the same event appears
  // on both a member's shared primary AND strvxteam's own primary).
  function dedup(events: ClassifiedEvent[]): MemberEvent[] {
    const seen = new Set<string>();
    const out: MemberEvent[] = [];
    for (const e of events) {
      if (e.uidKey && seen.has(e.uidKey)) continue;
      if (e.uidKey) seen.add(e.uidKey);
      out.push({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        isAllDay: e.isAllDay,
        meetLink: e.meetLink,
      });
    }
    return out;
  }

  const eventsByMember: Record<MemberKey, MemberEvent[]> = {
    alex: dedup(alexEvents),
    nick: dedup(nickEvents),
  };

  const members: TeamMemberAvailability[] = (
    Object.keys(MEMBER_BY_KEY) as MemberKey[]
  ).map((key) => {
    const cfg = MEMBER_BY_KEY[key];
    const row = userByEmail.get(cfg.email);
    return {
      id: row?.id ?? cfg.email,
      name: cfg.name,
      email: cfg.email,
      color: cfg.color,
      connected: true, // the team token is connected for everyone, or the whole API errors
      events: eventsByMember[key],
    };
  });

  return NextResponse.json({
    members,
    currentUserEmail: user.email ?? null,
    calendars: fetched.calendars,
  } satisfies TeamAvailabilityResponse);
}
