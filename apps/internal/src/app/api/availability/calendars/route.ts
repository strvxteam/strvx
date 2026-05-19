// GET   /api/availability/calendars  → every calendar visible to strvxteam
//                                       + its current classification +
//                                       whether the classification came from
//                                       a manual DB mapping
// POST  /api/availability/calendars  → upsert a manual mapping
//                                       body: { calendarId, owner, label? }
//
// Used by the /availability/settings page so ops can assign side calendars
// (Alex's "Tutoring", Nick's "Travel", etc.) to their owners when the
// heuristic classifier can't auto-recognize them.

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { getTeamRefreshToken, teamCalendarOwners } from "@/lib/google-calendar";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Owner = "alex" | "nick" | "team" | "skip";
const VALID_OWNERS: Owner[] = ["alex", "nick", "team", "skip"];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refreshToken = await getTeamRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        error: "strvxteam@gmail.com calendar is not connected.",
        connectUrl: "/api/auth/google/team-connect",
      },
      { status: 503 },
    );
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Paginate so we get every calendar.
  const items: {
    id?: string | null;
    summary?: string | null;
    summaryOverride?: string | null;
    primary?: boolean | null;
    accessRole?: string | null;
  }[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const res = await calendar.calendarList.list({
        minAccessRole: "freeBusyReader",
        maxResults: 250,
        pageToken,
      });
      items.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    console.error("[availability/calendars] calendarList.list failed:", err);
    return NextResponse.json(
      { error: "Could not list calendars from strvxteam@gmail.com" },
      { status: 502 },
    );
  }

  const mappingRows = await db
    .select({ calendarId: teamCalendarOwners.calendarId, owner: teamCalendarOwners.owner, label: teamCalendarOwners.label })
    .from(teamCalendarOwners);
  const mappingByCalId = new Map(mappingRows.map((m) => [m.calendarId.toLowerCase(), m]));

  const calendars = items
    .filter((c) => c.id)
    .map((c) => {
      const id = c.id!;
      const mapping = mappingByCalId.get(id.toLowerCase());
      return {
        id,
        summary: c.summary ?? c.summaryOverride ?? "(no name)",
        primary: c.primary === true,
        accessRole: c.accessRole ?? "unknown",
        mappedOwner: mapping?.owner ?? null,
        mappedLabel: mapping?.label ?? null,
      };
    });

  return NextResponse.json({ calendars });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { calendarId?: unknown; owner?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const calendarId = typeof body.calendarId === "string" ? body.calendarId.trim() : "";
  const owner = body.owner;
  const label = typeof body.label === "string" ? body.label.trim() || null : null;

  if (!calendarId) {
    return NextResponse.json({ error: "calendarId is required" }, { status: 400 });
  }
  if (typeof owner !== "string" || !VALID_OWNERS.includes(owner as Owner)) {
    return NextResponse.json(
      { error: `owner must be one of: ${VALID_OWNERS.join(", ")}` },
      { status: 400 },
    );
  }

  await db
    .insert(teamCalendarOwners)
    .values({ calendarId, owner, label })
    .onConflictDoUpdate({
      target: teamCalendarOwners.calendarId,
      set: { owner, label, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true, calendarId, owner, label });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const calendarId = req.nextUrl.searchParams.get("calendarId")?.trim();
  if (!calendarId) {
    return NextResponse.json({ error: "calendarId is required" }, { status: 400 });
  }

  await db.delete(teamCalendarOwners).where(eq(teamCalendarOwners.calendarId, calendarId));
  return NextResponse.json({ ok: true, calendarId });
}
