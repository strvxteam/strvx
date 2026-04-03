export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabase, type TeamMember } from "@/lib/supabase";
import { getTeamBusyTimes, calculateAvailability } from "@/lib/google-calendar";

const MIN_REQUIRED = parseInt(process.env.MIN_REQUIRED_MEMBERS ?? "3", 10);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const duration = parseInt(searchParams.get("duration") ?? "30", 10);
    const min = parseInt(searchParams.get("min") ?? String(MIN_REQUIRED), 10);

    if (!startParam || !endParam) {
      return NextResponse.json({ error: "start and end are required" }, { status: 400 });
    }

    const dateStart = new Date(startParam);
    const dateEnd = new Date(endParam);

    if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    if (dateEnd <= dateStart) {
      return NextResponse.json({ error: "end must be after start" }, { status: 400 });
    }

    // Fetch active members that have connected their Google Calendar
    const { data: members, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("is_active", true)
      .not("google_refresh_token", "is", null);

    if (error) {
      console.error("Failed to fetch team members:", error);
      return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 });
    }

    if (!members || members.length === 0) {
      return NextResponse.json({ slots: {}, message: "No connected calendars" });
    }

    const busyMap = await getTeamBusyTimes(members as TeamMember[], dateStart, dateEnd);
    const memberIds = (members as TeamMember[]).map((m) => m.id);
    const slots = calculateAvailability(busyMap, memberIds, dateStart, dateEnd, duration, min);

    // Build member ID → name lookup
    const memberNames: Record<string, string> = {};
    (members as TeamMember[]).forEach((m) => { memberNames[m.id] = m.name; });

    // Group by date (Pacific time)
    const grouped: Record<string, { start: string; end: string; members: string[]; allFree: boolean }[]> = {};

    for (const slot of slots) {
      const dateKey = slot.start.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        members: slot.availableMembers.map((id) => memberNames[id] ?? id),
        allFree: slot.allAvailable,
      });
    }

    return NextResponse.json({ slots: grouped });
  } catch (err) {
    console.error("Availability error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
