import { NextRequest, NextResponse } from "next/server";
import { getTeamCalendarEvents } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");

  if (!timeMin || !timeMax) {
    return NextResponse.json({ error: "timeMin and timeMax required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teamCalendarId = process.env.TEAM_CALENDAR_ID ?? "strvxteam@gmail.com";
    const events = await getTeamCalendarEvents(timeMin, timeMax, [teamCalendarId, user.email]);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[Google Calendar API] Error:", err);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
