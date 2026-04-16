export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { followUpLinks } from "@strvx/db/schema";
import { eq } from "drizzle-orm";
import { getSharedCalendarBusyTimes, calculateSlotsFromBusy } from "@/lib/google-calendar";
import { getMeetingDuration } from "@/lib/meeting-types";

const BUFFER_15_MIN = 15 * 60 * 1000;
const BUSINESS_HOURS_END_5PM = 17;
const STEP_MINUTES = 30;

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
      .select({ id: followUpLinks.id, meetingType: followUpLinks.meetingType })
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

    // 15-min buffer, end at 5 PM — single shared calendar as source of truth
    const durationMinutes = getMeetingDuration(link.meetingType);
    const busySlots = await getSharedCalendarBusyTimes(dateStart, dateEnd, BUFFER_15_MIN);
    const slots = calculateSlotsFromBusy(
      busySlots,
      dateStart,
      dateEnd,
      durationMinutes,
      BUSINESS_HOURS_END_5PM,
      STEP_MINUTES
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
