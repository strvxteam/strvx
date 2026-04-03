import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, contacts, engagements, interactions, stageHistory, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const body = await request.text();

  // Verify webhook signature — fail-closed if secret is not configured
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("calendly-webhook-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // Calendly uses HMAC-SHA256
  const parts = signature.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const sigPart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !sigPart) {
    return NextResponse.json({ error: "Invalid signature format" }, { status: 401 });
  }

  const timestamp = timestampPart.slice(2);
  const providedSig = sigPart.slice(3);
  const payload = `${timestamp}.${body}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  const providedBuf = Buffer.from(providedSig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = data.event;

  if (event !== "invitee.created") {
    // Only handle new bookings for now
    return NextResponse.json({ ok: true, skipped: true });
  }

  const parsedPayload = data.payload;
  const inviteeName = parsedPayload?.name || "Unknown";
  const inviteeEmail = parsedPayload?.email || null;
  const eventName = parsedPayload?.event_type?.name || "Discovery Call";
  const scheduledAt = parsedPayload?.event?.start_time || null;
  const calendlyEventUri = parsedPayload?.uri || null;

  // Idempotency: check if we already processed this event
  if (calendlyEventUri) {
    const existing = await db.execute(
      sql`SELECT id FROM interactions WHERE content LIKE '%' || ${calendlyEventUri} || '%' LIMIT 1`
    );
    if (existing && (existing as unknown[]).length > 0) {
      return NextResponse.json({ ok: true, deduplicated: true });
    }
  }

  // Get a system user (first user in the DB) for attribution
  const [systemUser] = await db.select().from(users).limit(1);
  if (!systemUser) {
    return NextResponse.json(
      { error: "No users in system" },
      { status: 500 }
    );
  }

  // Check if contact already exists by email
  let contact = null;
  if (inviteeEmail) {
    const [existing] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.email, inviteeEmail))
      .limit(1);
    contact = existing || null;
  }

  // If no existing contact, create company + contact + engagement in a transaction
  if (!contact) {
    const companyName = inviteeName.split(" ").pop() + " (via Calendly)";

    await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({ name: companyName })
        .returning();

      const [newContact] = await tx
        .insert(contacts)
        .values({
          name: inviteeName,
          email: inviteeEmail,
          companyId: company.id,
        })
        .returning();

      const [engagement] = await tx
        .insert(engagements)
        .values({
          companyId: company.id,
          primaryContactId: newContact.id,
          name: eventName,
          stage: "lead",
        })
        .returning();

      await tx.insert(stageHistory).values({
        engagementId: engagement.id,
        stage: "lead",
      });

      await tx.insert(interactions).values({
        engagementId: engagement.id,
        authorId: systemUser.id,
        type: "meeting",
        content: `Calendly booking: ${eventName} with ${inviteeName}${calendlyEventUri ? ` (${calendlyEventUri})` : ""}`,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      });
    });
  }

  return NextResponse.json({ ok: true, created: true });
}
