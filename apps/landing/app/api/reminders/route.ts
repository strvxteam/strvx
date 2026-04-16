export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { bookings, bookingMembers, users } from "@strvx/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { sendReminderEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results = { sent24h: 0, sent1h: 0, errors: 0 };

  try {
    // ── 24-hour reminders
    const window24hStart = new Date(now.getTime() + 23.75 * 60 * 60 * 1000);
    const window24hEnd = new Date(now.getTime() + 24.25 * 60 * 60 * 1000);

    const bookings24h = await db
      .select()
      .from(bookings)
      .where(and(
        eq(bookings.status, "confirmed"),
        eq(bookings.reminderSent24h, false),
        gte(bookings.startTime, window24hStart),
        lte(bookings.startTime, window24hEnd)
      ));

    for (const booking of bookings24h) {
      try {
        const members = await db
          .select({ name: users.name })
          .from(bookingMembers)
          .innerJoin(users, eq(bookingMembers.memberId, users.id))
          .where(eq(bookingMembers.bookingId, booking.id));

        await sendReminderEmail(
          {
            clientName: booking.clientName,
            clientEmail: booking.clientEmail,
            startTime: booking.startTime.toISOString(),
            endTime: booking.endTime.toISOString(),
            teamMemberNames: members.map((m) => m.name),
            meetLink: booking.meetLink ?? "",
            serviceType: booking.serviceType ?? "discovery",
          },
          "24h"
        );

        await db.update(bookings).set({ reminderSent24h: true }).where(eq(bookings.id, booking.id));
        results.sent24h++;
      } catch (err) {
        console.error(`24h reminder failed for booking ${booking.id}:`, err);
        results.errors++;
      }
    }

    // ── 1-hour reminders
    const window1hStart = new Date(now.getTime() + 52.5 * 60 * 1000);
    const window1hEnd = new Date(now.getTime() + 67.5 * 60 * 1000);

    const bookings1h = await db
      .select()
      .from(bookings)
      .where(and(
        eq(bookings.status, "confirmed"),
        eq(bookings.reminderSent1h, false),
        gte(bookings.startTime, window1hStart),
        lte(bookings.startTime, window1hEnd)
      ));

    for (const booking of bookings1h) {
      try {
        const members = await db
          .select({ name: users.name })
          .from(bookingMembers)
          .innerJoin(users, eq(bookingMembers.memberId, users.id))
          .where(eq(bookingMembers.bookingId, booking.id));

        await sendReminderEmail(
          {
            clientName: booking.clientName,
            clientEmail: booking.clientEmail,
            startTime: booking.startTime.toISOString(),
            endTime: booking.endTime.toISOString(),
            teamMemberNames: members.map((m) => m.name),
            meetLink: booking.meetLink ?? "",
            serviceType: booking.serviceType ?? "discovery",
          },
          "1h"
        );

        await db.update(bookings).set({ reminderSent1h: true }).where(eq(bookings.id, booking.id));
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
