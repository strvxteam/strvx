export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { users } from "@strvx/db/schema";
import { eq } from "drizzle-orm";
import { getSharedCalendarBusyTimes, calculateSlotsFromBusy } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const duration = parseInt(searchParams.get("duration") ?? "30", 10);

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

    // All active members — used only for the response payload (names), not for calendar queries
    const members = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.isActive, true));

    const memberNames = members.map((m) => m.name);

    // Single source of truth: the shared team calendar + any personal calendars shared with it
    const busySlots = await getSharedCalendarBusyTimes(dateStart, dateEnd);
    const slots = calculateSlotsFromBusy(busySlots, dateStart, dateEnd, duration);

    const grouped: Record<string, { start: string; end: string; members: string[]; allFree: boolean }[]> = {};

    for (const slot of slots) {
      const dateKey = slot.start.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        members: memberNames,
        allFree: true,
      });
    }

    return NextResponse.json({ slots: grouped });
  } catch (err) {
    console.error("Availability error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
