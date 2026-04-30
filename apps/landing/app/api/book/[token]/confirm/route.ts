export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import {
  followUpLinks,
  bookings,
  bookingMembers,
  users,
  engagements,
  companies,
} from "@strvx/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSharedCalendarBusyTimes, createCalendarEvent } from "@/lib/google-calendar";
import { sendFollowUpConfirmation, sendFollowUpTeamNotification } from "@/lib/email";
import {
  getMeetingDuration,
  isInternalMeeting,
  INTERNAL_DURATION_OPTIONS,
} from "@/lib/meeting-types";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { startTime, endTime, clientName, clientEmail, clientCompany, notes, duration } = body;

    if (!startTime || !endTime || !clientName || !clientEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate token
    const [link] = await db
      .select()
      .from(followUpLinks)
      .where(eq(followUpLinks.token, token))
      .limit(1);

    if (!link) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }

    // Check expiry (last booking within 3 months OR created within 3 months)
    const [lastBooking] = await db
      .select({ createdAt: bookings.createdAt })
      .from(bookings)
      .where(eq(bookings.followUpToken, token))
      .orderBy(desc(bookings.createdAt))
      .limit(1);

    const lastActivity = lastBooking?.createdAt ?? link.createdAt;
    if (lastActivity.getTime() < Date.now() - THREE_MONTHS_MS) {
      return NextResponse.json({ error: "This booking link has expired" }, { status: 410 });
    }

    // Verify the slot is still available against the shared team calendar
    const slotStart = new Date(startTime);
    const slotEnd = new Date(endTime);
    const bufferMs = 15 * 60 * 1000;

    // For internal meetings the client picks duration; otherwise use the type default.
    let durationMinutes = getMeetingDuration(link.meetingType);
    if (isInternalMeeting(link.meetingType)) {
      const dParsed = typeof duration === "number" ? duration : parseInt(String(duration ?? ""), 10);
      if (
        Number.isFinite(dParsed) &&
        (INTERNAL_DURATION_OPTIONS as readonly number[]).includes(dParsed)
      ) {
        durationMinutes = dParsed;
      } else {
        return NextResponse.json(
          { error: "Invalid duration. Must be 30, 45, or 60 minutes." },
          { status: 400 }
        );
      }
    }

    // Ensure the client-submitted slot matches the expected duration
    const actualDurationMinutes = Math.round((slotEnd.getTime() - slotStart.getTime()) / 60000);
    if (actualDurationMinutes !== durationMinutes) {
      return NextResponse.json(
        { error: "Invalid slot duration for this meeting type" },
        { status: 400 }
      );
    }

    const checkStart = new Date(slotStart.getTime() - bufferMs);
    const checkEnd = new Date(slotEnd.getTime() + bufferMs);
    const busySlots = await getSharedCalendarBusyTimes(checkStart, checkEnd, bufferMs);
    const conflict = busySlots.some((b) => {
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();
      return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
    });
    if (conflict) {
      return NextResponse.json(
        { error: "This time slot is no longer available. Please pick another time." },
        { status: 409 }
      );
    }

    // Get all active members for the booking record
    const activeMembers = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.isActive, true));

    // Create calendar event on team calendar
    const { eventId, meetLink } = await createCalendarEvent({
      clientName,
      clientEmail,
      startTime: slotStart,
      endTime: slotEnd,
      serviceType: link.meetingType,
    });

    // Get engagement info for the booking record (skipped for internal links with no engagement)
    const engRow = link.engagementId
      ? (
          await db
            .select({ companyName: companies.name })
            .from(engagements)
            .innerJoin(companies, eq(engagements.companyId, companies.id))
            .where(eq(engagements.id, link.engagementId))
            .limit(1)
        )[0]
      : undefined;

    // Save booking
    const [booking] = await db
      .insert(bookings)
      .values({
        clientName,
        clientEmail,
        clientCompany: clientCompany ?? engRow?.companyName ?? null,
        serviceType: link.meetingType,
        startTime: slotStart,
        endTime: slotEnd,
        durationMinutes,
        meetLink: meetLink ?? null,
        notes: notes ?? null,
        googleEventIds: eventId ? { team: eventId } : null,
        engagementId: link.engagementId,
        followUpToken: token,
        meetingType: link.meetingType,
      })
      .returning();

    // Add all active team members as booking members
    if (activeMembers.length > 0) {
      await db.insert(bookingMembers).values(
        activeMembers.map((m) => ({ bookingId: booking.id, memberId: m.id }))
      );
    }

    // Send emails (non-blocking — don't fail the booking if email fails)
    const emailPayload = {
      bookingId: booking.id,
      clientName,
      clientEmail,
      meetingType: link.meetingType,
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      meetLink: meetLink ?? "",
    };

    const emailResults = await Promise.allSettled([
      sendFollowUpConfirmation(emailPayload),
      sendFollowUpTeamNotification({
        clientName,
        clientEmail,
        clientCompany: clientCompany ?? engRow?.companyName ?? null,
        meetingType: link.meetingType,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        meetLink: meetLink ?? "",
        notes: notes ?? null,
      }),
    ]);
    const [clientEmailResult, teamEmailResult] = emailResults;
    if (clientEmailResult.status === "rejected")
      console.error("[follow-up confirm] Client confirmation email failed:", clientEmailResult.reason);
    if (teamEmailResult.status === "rejected")
      console.error("[follow-up confirm] Team notification email failed:", teamEmailResult.reason);

    return NextResponse.json({ success: true, bookingId: booking.id, meetLink: meetLink ?? "" });
  } catch (err) {
    console.error("[follow-up confirm]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
