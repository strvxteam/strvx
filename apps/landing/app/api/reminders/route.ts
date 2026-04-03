export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendReminderEmail } from "@/lib/email";

// Vercel Cron — runs every 15 minutes
// Protected by CRON_SECRET in Authorization header
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { sent24h: 0, sent1h: 0, errors: 0 };

  try {
    // ── 24-hour reminders ──────────────────────────────────────────────────
    const window24hStart = new Date(now.getTime() + 23.75 * 60 * 60 * 1000);
    const window24hEnd = new Date(now.getTime() + 24.25 * 60 * 60 * 1000);

    const { data: bookings24h } = await supabase
      .from("bookings")
      .select(`*, booking_members(member_id, team_members(name))`)
      .eq("status", "confirmed")
      .eq("reminder_sent_24h", false)
      .gte("start_time", window24hStart.toISOString())
      .lte("start_time", window24hEnd.toISOString());

    for (const booking of bookings24h ?? []) {
      try {
        const memberNames = booking.booking_members
          ?.map((bm: { team_members: { name: string } | null }) => bm.team_members?.name)
          .filter(Boolean) ?? [];

        await sendReminderEmail(
          {
            clientName: booking.client_name,
            clientEmail: booking.client_email,
            startTime: booking.start_time,
            endTime: booking.end_time,
            teamMemberNames: memberNames,
            meetLink: booking.meet_link ?? "",
          },
          "24h"
        );

        await supabase
          .from("bookings")
          .update({ reminder_sent_24h: true })
          .eq("id", booking.id);

        results.sent24h++;
      } catch (err) {
        console.error(`24h reminder failed for booking ${booking.id}:`, err);
        results.errors++;
      }
    }

    // ── 1-hour reminders ───────────────────────────────────────────────────
    const window1hStart = new Date(now.getTime() + 52.5 * 60 * 1000);
    const window1hEnd = new Date(now.getTime() + 67.5 * 60 * 1000);

    const { data: bookings1h } = await supabase
      .from("bookings")
      .select(`*, booking_members(member_id, team_members(name))`)
      .eq("status", "confirmed")
      .eq("reminder_sent_1h", false)
      .gte("start_time", window1hStart.toISOString())
      .lte("start_time", window1hEnd.toISOString());

    for (const booking of bookings1h ?? []) {
      try {
        const memberNames = booking.booking_members
          ?.map((bm: { team_members: { name: string } | null }) => bm.team_members?.name)
          .filter(Boolean) ?? [];

        await sendReminderEmail(
          {
            clientName: booking.client_name,
            clientEmail: booking.client_email,
            startTime: booking.start_time,
            endTime: booking.end_time,
            teamMemberNames: memberNames,
            meetLink: booking.meet_link ?? "",
          },
          "1h"
        );

        await supabase
          .from("bookings")
          .update({ reminder_sent_1h: true })
          .eq("id", booking.id);

        results.sent1h++;
      } catch (err) {
        console.error(`1h reminder failed for booking ${booking.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("Reminders cron error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
