export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@strvx/db";
import {
  users,
  bookings,
  bookingMembers,
  companies,
  contacts,
  engagements,
  stageHistory,
  interactions,
} from "@strvx/db/schema";
import { eq, and, isNotNull, ilike } from "drizzle-orm";
import type { TeamMember } from "@/lib/types";
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

    if (slotStart <= new Date()) {
      return NextResponse.json({ error: "Cannot book a time in the past" }, { status: 400 });
    }

    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

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

    if (!members || members.length === 0) {
      return NextResponse.json({ error: "Booking unavailable at this time" }, { status: 500 });
    }

    const busyMap = await getTeamBusyTimes(members as TeamMember[], slotStart, slotEnd);
    const memberIds = members.map((m) => m.id);
    const available = calculateAvailability(busyMap, memberIds, slotStart, slotEnd, duration, MIN_REQUIRED);

    if (available.length === 0) {
      return NextResponse.json(
        { error: "This time slot is no longer available" },
        { status: 409 }
      );
    }

    const chosenSlot = available[0];
    const availableMembers = members.filter((m) =>
      chosenSlot.availableMembers.includes(m.id)
    );

    const organizer = availableMembers.find((m) => m.googleRefreshToken);
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

    const [booking] = await db
      .insert(bookings)
      .values({
        clientName,
        clientEmail,
        clientPhone: clientPhone ?? null,
        clientCompany: clientCompany ?? null,
        notes: clientNotes ?? null,
        serviceType,
        startTime: slotStart,
        endTime: slotEnd,
        durationMinutes: duration,
        status: "confirmed",
        googleEventIds,
        meetLink,
      })
      .returning();

    await db.insert(bookingMembers).values(
      availableMembers.map((m) => ({ bookingId: booking.id, memberId: m.id }))
    );

    const memberNames = availableMembers.map((m) => m.name);

    // ── Create CRM records (company → contact → engagement → timeline) ──
    try {
      const [systemUser] = await db.select().from(users).limit(1);
      if (systemUser) {
        await db.transaction(async (tx) => {
          // Company: find or create
          let companyId: string;
          const companyLabel = clientCompany ?? clientName;

          if (clientCompany) {
            const [existing] = await tx
              .select()
              .from(companies)
              .where(ilike(companies.name, clientCompany))
              .limit(1);
            if (existing) {
              companyId = existing.id;
            } else {
              const [created] = await tx
                .insert(companies)
                .values({ name: clientCompany })
                .returning();
              companyId = created.id;
            }
          } else {
            const [created] = await tx
              .insert(companies)
              .values({ name: `${clientName} (via Booking)` })
              .returning();
            companyId = created.id;
          }

          // Contact: find by email or create
          const [existingContact] = await tx
            .select()
            .from(contacts)
            .where(eq(contacts.email, clientEmail))
            .limit(1);

          let contactId: string;
          if (existingContact) {
            contactId = existingContact.id;
          } else {
            const [created] = await tx
              .insert(contacts)
              .values({
                name: clientName,
                email: clientEmail,
                phone: clientPhone ?? null,
                companyId,
              })
              .returning();
            contactId = created.id;
          }

          // Engagement at discovery stage
          const [engagement] = await tx
            .insert(engagements)
            .values({
              companyId,
              primaryContactId: contactId,
              name: `Discovery — ${companyLabel}`,
              stage: "discovery",
              source: "booking",
            })
            .returning();

          // Stage history
          await tx.insert(stageHistory).values({
            engagementId: engagement.id,
            stage: "discovery",
          });

          // Interaction for timeline
          await tx.insert(interactions).values({
            engagementId: engagement.id,
            authorId: systemUser.id,
            type: "meeting",
            content: `Discovery Call with ${clientName}${clientNotes ? ` — "${clientNotes}"` : ""} (booking:${booking.id})`,
            scheduledAt: slotStart,
          });
        });
      }
    } catch (crmErr) {
      // Log but don't fail the booking — CRM entry is secondary
      console.error("CRM record creation failed:", crmErr);
    }

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
      sendTeamNotification(["team@strvx.com"], {
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
    ]).then((results) => {
      results.forEach((r) => {
        if (r.status === "rejected") console.error("Email error:", r.reason);
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
    console.error("Booking error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again or contact us at team@strvx.com." },
      { status: 500 }
    );
  }
}
