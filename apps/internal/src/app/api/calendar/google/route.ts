import { NextRequest, NextResponse } from "next/server";
import { getGoogleCalendarEvents } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";
import { getUserByEmail } from "@/lib/queries";

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

    const dbUser = await getUserByEmail(user.email);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const events = await getGoogleCalendarEvents(dbUser.id, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[Google Calendar API] Error:", err);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
