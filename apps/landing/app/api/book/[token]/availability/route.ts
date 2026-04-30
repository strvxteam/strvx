export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { followUpLinks } from "@strvx/db/schema";
import { eq } from "drizzle-orm";
import { getSharedCalendarBusyTimes, calculateSlotsFromBusy } from "@/lib/google-calendar";
import {
  getMeetingDuration,
  isInternalMeeting,
  INTERNAL_DURATION_OPTIONS,
} from "@/lib/meeting-types";

const BUFFER_10_MIN = 10 * 60 * 1000;
const BUSINESS_HOURS_END_8PM = 20;
const STEP_MINUTES = 30;
const WEEKDAYS_ONLY = true;

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

    // 10-min buffer, weekdays only, 9 AM – 8 PM PT — single shared calendar.
    // For internal meetings, the client picks duration via ?duration= query param.
    let durationMinutes = getMeetingDuration(link.meetingType);
    if (isInternalMeeting(link.meetingType)) {
      const dParam = parseInt(searchParams.get("duration") ?? "", 10);
      if (
        Number.isFinite(dParam) &&
        (INTERNAL_DURATION_OPTIONS as readonly number[]).includes(dParam)
      ) {
        durationMinutes = dParam;
      }
    }
    const busySlots = await getSharedCalendarBusyTimes(dateStart, dateEnd, BUFFER_10_MIN);
    const slots = calculateSlotsFromBusy(
      busySlots,
      dateStart,
      dateEnd,
      durationMinutes,
      BUSINESS_HOURS_END_8PM,
      STEP_MINUTES,
      WEEKDAYS_ONLY
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
