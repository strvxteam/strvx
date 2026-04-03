export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  // Authenticate with WEBHOOK_SECRET header
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      meetLink,
      eventId,
      meetingTime,
      summary,
      actionItems,
      fullTranscript,
    } = body;

    if (!summary) {
      return NextResponse.json({ error: "summary is required" }, { status: 400 });
    }

    // Match booking — priority: meetLink → start_time window → event_id
    let booking: { id: string } | null = null;

    // 1. Match by meet_link
    if (meetLink) {
      const { data } = await supabase
        .from("bookings")
        .select("id")
        .eq("meet_link", meetLink)
        .maybeSingle();
      booking = data;
    }

    // 2. Match by start_time within a 15-minute window
    if (!booking && meetingTime) {
      const meetingDate = new Date(meetingTime);
      if (!isNaN(meetingDate.getTime())) {
        const windowStart = new Date(meetingDate.getTime() - 15 * 60 * 1000);
        const windowEnd = new Date(meetingDate.getTime() + 15 * 60 * 1000);

        const { data } = await supabase
          .from("bookings")
          .select("id")
          .gte("start_time", windowStart.toISOString())
          .lte("start_time", windowEnd.toISOString())
          .eq("status", "confirmed")
          .order("start_time", { ascending: true })
          .limit(1)
          .maybeSingle();
        booking = data;
      }
    }

    // 3. Match by event_id in google_event_ids JSONB array
    if (!booking && eventId) {
      const { data } = await supabase
        .from("bookings")
        .select("id")
        .contains("google_event_ids", [{ event_id: eventId }])
        .maybeSingle();
      booking = data;
    }

    if (!booking) {
      // Return 200 to prevent Zapier from retrying — just log it
      console.warn("Fathom webhook: no matching booking found", { meetLink, eventId, meetingTime });
      return NextResponse.json({ received: true, matched: false });
    }

    // Parse actionItems — accept string[] or comma-separated string
    let parsedActionItems: string[] | null = null;
    if (Array.isArray(actionItems)) {
      parsedActionItems = actionItems;
    } else if (typeof actionItems === "string" && actionItems.trim()) {
      parsedActionItems = actionItems.split("\n").map((s: string) => s.trim()).filter(Boolean);
    }

    await supabase
      .from("bookings")
      .update({
        notes: fullTranscript ?? summary,
        notes_summary: summary,
        notes_action_items: parsedActionItems,
        status: "completed",
      })
      .eq("id", booking.id);

    return NextResponse.json({ received: true, matched: true, bookingId: booking.id });
  } catch (err) {
    console.error("Fathom webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
