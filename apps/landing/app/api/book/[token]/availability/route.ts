export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { followUpLinks, users } from "@strvx/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getTeamBusyTimes, calculateAvailability } from "@/lib/google-calendar";
import type { TeamMember } from "@/lib/types";

const BUFFER_15_MIN = 15 * 60 * 1000;
const BUSINESS_HOURS_END_5PM = 17;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = request.nextUrl;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    if (!startParam || !endParam) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    // Validate token exists
    const [link] = await db
      .select({ id: followUpLinks.id })
      .from(followUpLinks)
      .where(eq(followUpLinks.token, token))
      .limit(1);

    if (!link) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const dateStart = new Date(startParam);
    const dateEnd = new Date(endParam);

    if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    // Get all active team members with Google Calendar connected
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        googleRefreshToken: users.googleRefreshToken,
        calendarId: users.calendarId,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.isActive, true), isNotNull(users.googleRefreshToken)));

    if (!members.length) {
      return NextResponse.json({ slots: {} });
    }

    // 15-min buffer, all members must be free, end at 5 PM
    const busyMap = await getTeamBusyTimes(
      members as TeamMember[],
      dateStart,
      dateEnd,
      BUFFER_15_MIN
    );

    const slots = calculateAvailability(
      busyMap,
      members.map((m) => m.id),
      dateStart,
      dateEnd,
      30,
      members.length, // all must be free
      BUSINESS_HOURS_END_5PM
    );

    const grouped: Record<string, { start: string; end: string }[]> = {};
    for (const slot of slots) {
      const dateKey = slot.start.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({ start: slot.start.toISOString(), end: slot.end.toISOString() });
    }

    return NextResponse.json({ slots: grouped });
  } catch (err) {
    console.error("[follow-up availability]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
