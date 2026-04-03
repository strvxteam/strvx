export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabase, type TeamMember } from "@/lib/supabase";
import {
  getTeamBusyTimes,
  calculateAvailability,
  createCalendarEvent,
} from "@/lib/google-calendar";
import { sendConfirmationEmail, sendTeamNotification } from "@/lib/email";

const MIN_REQUIRED = parseInt(process.env.MIN_REQUIRED_MEMBERS ?? "3", 10);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      clientNotes,
      serviceType = "discovery",
      startTime,
      duration = 30,
    } = body;

    // Validate required fields
    if (!clientName || !clientEmail || !startTime) {
      return NextResponse.json(
        { error: "clientName, clientEmail, and startTime are required" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const slotStart = new Date(startTime);
    if (isNaN(slotStart.getTime())) {
      return NextResponse.json({ error: "Invalid startTime format" }, { status: 400 });
    }

    // Reject past times
    if (slotStart <= new Date()) {
      return NextResponse.json({ error: "Cannot book a time in the past" }, { status: 400 });
    }

    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    // Fetch active members with connected calendars
    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("*")
      .eq("is_active", true)
      .not("google_refresh_token", "is", null);

    if (membersError || !members || members.length === 0) {
      console.error("Failed to fetch team members:", JSON.stringify(membersError, null, 2), "count:", members?.length);
      return NextResponse.json({ error: "Booking unavailable at this time", detail: membersError?.message ?? `${members?.length ?? 0} members found` }, { status: 500 });
    }

    // Re-verify availability to prevent race conditions
    const busyMap = await getTeamBusyTimes(members as TeamMember[], slotStart, slotEnd);
    const memberIds = (members as TeamMember[]).map((m) => m.id);
    const available = calculateAvailability(busyMap, memberIds, slotStart, slotEnd, duration, MIN_REQUIRED);

    if (available.length === 0) {
      return NextResponse.json(
        { error: "This time slot is no longer available" },
        { status: 409 }
      );
    }

    const chosenSlot = available[0];
    const availableMembers = (members as TeamMember[]).filter((m) =>
      chosenSlot.availableMembers.includes(m.id)
    );

    // Create ONE event on the shared team calendar with all available members as attendees
    const organizer = availableMembers.find((m) => m.google_refresh_token);
    if (!organizer) {
      return NextResponse.json({ error: "No connected team member available" }, { status: 500 });
    }

    const { eventId, meetLink } = await createCalendarEvent({
      clientName,
      clientEmail,
      startTime: slotStart,
      endTime: slotEnd,
      serviceType,
    });

    const googleEventIds = [{ member_id: organizer.id, event_id: eventId }];

    // Save booking to Supabase
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone ?? null,
        client_company: clientCompany ?? null,
        notes: clientNotes ?? null,
        service_type: serviceType,
        start_time: slotStart.toISOString(),
        end_time: slotEnd.toISOString(),
        duration_minutes: duration,
        status: "confirmed",
        google_event_ids: googleEventIds,
        meet_link: meetLink,
      })
      .select()
      .single();

    if (bookingError || !booking) {
      console.error("Failed to save booking:", JSON.stringify(bookingError, null, 2));
      return NextResponse.json({ error: "Failed to save booking", detail: bookingError?.message ?? "unknown" }, { status: 500 });
    }

    // Save booking_members junction records
    await supabase.from("booking_members").insert(
      availableMembers.map((m) => ({ booking_id: booking.id, member_id: m.id }))
    );

    // Send emails + notify internal tool (non-blocking — log but don't fail the booking)
    const memberNames = availableMembers.map((m) => m.name);

    const internalToolUrl = process.env.INTERNAL_TOOL_URL;
    const internalToolSecret = process.env.INTERNAL_TOOL_WEBHOOK_SECRET;

    Promise.allSettled([
      sendConfirmationEmail({
        bookingId: booking.id,
        clientName,
        clientEmail,
        serviceType,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        teamMemberNames: memberNames,
        meetLink: meetLink ?? "",
      }),
      sendTeamNotification(["strvxteam@gmail.com"], {
        clientName,
        clientEmail,
        clientPhone,
        clientCompany,
        clientNotes,
        serviceType,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        meetLink: meetLink ?? "",
      }),
      // Notify internal tool so client appears in CRM pipeline
      ...(internalToolUrl && internalToolSecret
        ? [
            fetch(`${internalToolUrl}/api/webhooks/booking`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${internalToolSecret}`,
              },
              body: JSON.stringify({
                clientName,
                clientEmail,
                clientPhone: clientPhone ?? null,
                clientCompany: clientCompany ?? null,
                clientNotes: clientNotes ?? null,
                startTime: slotStart.toISOString(),
                endTime: slotEnd.toISOString(),
                duration,
                meetLink: meetLink ?? null,
                bookingId: booking.id,
              }),
            }),
          ]
        : []),
    ]).then((results) => {
      results.forEach((r) => {
        if (r.status === "rejected") console.error("Email/webhook error:", r.reason);
      });
    });

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        teamMembers: memberNames,
        meetLink,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("Booking error:", message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
