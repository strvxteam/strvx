export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import { bookings, bookingMembers, users } from "@strvx/db/schema";
import { eq, gte, lte, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.API_KEY;

  if (!authHeader || !apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const conditions = [];
    if (status) conditions.push(eq(bookings.status, status as "confirmed" | "cancelled" | "completed" | "no_show"));
    if (from) conditions.push(gte(bookings.startTime, new Date(from)));
    if (to) conditions.push(lte(bookings.startTime, new Date(to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(bookings)
      .where(where)
      .orderBy(desc(bookings.startTime))
      .limit(limit)
      .offset(offset);

    // Fetch members for each booking
    const bookingsWithMembers = await Promise.all(
      rows.map(async (booking) => {
        const members = await db
          .select({ memberId: bookingMembers.memberId, name: users.name, email: users.email })
          .from(bookingMembers)
          .innerJoin(users, eq(bookingMembers.memberId, users.id))
          .where(eq(bookingMembers.bookingId, booking.id));

        return { ...booking, booking_members: members };
      })
    );

    return NextResponse.json({ bookings: bookingsWithMembers, total: rows.length, limit, offset });
  } catch (err) {
    console.error("Bookings API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
