import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  companies,
  contacts,
  engagements,
  stageHistory,
  interactions,
  users,
} from "@/lib/db/schema";
import { eq, ilike, sql } from "drizzle-orm";

// ── Payload validation ────────────────────────────────────
const bookingPayloadSchema = z.object({
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
  clientPhone: z.string().nullable(),
  clientCompany: z.string().nullable(),
  clientNotes: z.string().nullable(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  duration: z.number().positive(),
  meetLink: z.string().url().nullable(),
  bookingId: z.string().min(1),
});

type BookingPayload = z.infer<typeof bookingPayloadSchema>;

// ── Route handler ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Authenticate via Bearer token
  const secret = process.env.BOOKING_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || token !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate payload
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bookingPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload: BookingPayload = parsed.data;

  // 3. Idempotency: skip if we already processed this bookingId
  const existing = await db.execute(
    sql`SELECT id FROM interactions WHERE content LIKE '%' || ${payload.bookingId} || '%' LIMIT 1`
  );
  if (existing && (existing as unknown[]).length > 0) {
    return Response.json({ ok: true, deduplicated: true }, { status: 200 });
  }

  // 4. Get a system user for attribution
  const [systemUser] = await db.select().from(users).limit(1);
  if (!systemUser) {
    return Response.json(
      { error: "No users in system" },
      { status: 500 }
    );
  }

  // 5. Create records inside a transaction
  try {
    await db.transaction(async (tx) => {
      // --- Company: find or create ---
      let companyId: string;
      const companyLabel = payload.clientCompany ?? payload.clientName;

      if (payload.clientCompany) {
        const [existing] = await tx
          .select()
          .from(companies)
          .where(ilike(companies.name, payload.clientCompany))
          .limit(1);

        if (existing) {
          companyId = existing.id;
        } else {
          const [created] = await tx
            .insert(companies)
            .values({ name: payload.clientCompany })
            .returning();
          companyId = created.id;
        }
      } else {
        // No company provided — create a placeholder so the contact FK is satisfied
        const [created] = await tx
          .insert(companies)
          .values({ name: `${payload.clientName} (via Booking)` })
          .returning();
        companyId = created.id;
      }

      // --- Contact ---
      // Check for existing contact by email within the same company first
      const [existingContact] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.email, payload.clientEmail))
        .limit(1);

      let contactId: string;
      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const [created] = await tx
          .insert(contacts)
          .values({
            name: payload.clientName,
            email: payload.clientEmail,
            phone: payload.clientPhone,
            companyId,
          })
          .returning();
        contactId = created.id;
      }

      // --- Engagement at "discovery" stage ---
      const [engagement] = await tx
        .insert(engagements)
        .values({
          companyId,
          primaryContactId: contactId,
          name: `Discovery — ${companyLabel}`,
          stage: "discovery",
          source: "booking_webhook",
        })
        .returning();

      // Calendar event is NOT created here — the landing page already creates
      // a Google Calendar event with Meet link, which syncs into the internal
      // tool calendar via the Google Calendar integration. Creating a DB event
      // here would cause a duplicate.

      // --- Stage history ---
      await tx.insert(stageHistory).values({
        engagementId: engagement.id,
        stage: "discovery",
      });

      // --- Interaction record for timeline ---
      await tx.insert(interactions).values({
        engagementId: engagement.id,
        authorId: systemUser.id,
        type: "meeting",
        content: `Booking: Discovery Call with ${payload.clientName}${payload.clientNotes ? ` — "${payload.clientNotes}"` : ""} (booking:${payload.bookingId})`,
        scheduledAt: new Date(payload.startTime),
      });
    });

    return Response.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[booking-webhook]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
