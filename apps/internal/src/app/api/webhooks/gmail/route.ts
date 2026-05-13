import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, mailboxOauthTokens } from "@strvx/db";
import {
  parseAuthHeaderToken,
  verifyPubsubJwt,
  decodePubsubPushPayload,
  type PubsubPushEnvelope,
} from "@/lib/agent/pubsub-jwt";
import { gmailMessageReceived } from "@/trigger/gmail-message-received";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pub/Sub push receiver for Gmail watch events.
 *
 * Verifies the JWT, decodes the envelope, looks up the mailbox, and
 * (when AGENT_INGEST_ENABLED=true) enqueues a `gmail.message.received`
 * Trigger.dev task to do the actual history-fetch + ingest. Otherwise
 * the push is logged in shadow mode.
 */
export async function POST(request: NextRequest) {
  const expectedAudience = process.env.GOOGLE_PUBSUB_WEBHOOK_URL;
  const expectedServiceAccount = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL;
  if (!expectedAudience || !expectedServiceAccount) {
    console.error("[gmail-webhook] env not configured");
    return new Response(null, { status: 401 });
  }

  const token = parseAuthHeaderToken(request.headers.get("authorization"));
  if (!token) {
    return new Response(null, { status: 401 });
  }

  try {
    await verifyPubsubJwt({
      token,
      expectedAudience,
      expectedServiceAccount,
    });
  } catch (err) {
    console.error("[gmail-webhook] JWT verification failed", err);
    return new Response(null, { status: 401 });
  }

  let envelope: PubsubPushEnvelope;
  try {
    envelope = (await request.json()) as PubsubPushEnvelope;
  } catch {
    return new Response(null, { status: 400 });
  }

  let payload;
  try {
    payload = decodePubsubPushPayload(envelope);
  } catch (err) {
    console.error("[gmail-webhook] payload decode failed", err);
    return new Response(null, { status: 400 });
  }

  const [mailbox] = await db
    .select({ id: mailboxOauthTokens.id, isActive: mailboxOauthTokens.isActive })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.email, payload.emailAddress))
    .limit(1);

  if (!mailbox) {
    console.warn(
      `[gmail-webhook] Received push for unknown mailbox: ${payload.emailAddress}`
    );
    return Response.json({ ok: true, ignored: true });
  }

  if (!mailbox.isActive) {
    console.info(
      `[gmail-webhook] Push for paused mailbox ignored: ${payload.emailAddress}`
    );
    return Response.json({ ok: true, paused: true });
  }

  const ingestEnabled = process.env.AGENT_INGEST_ENABLED === "true";

  if (ingestEnabled) {
    await gmailMessageReceived.trigger(
      {
        mailboxId: mailbox.id,
        historyIdHint: payload.historyId,
      },
      {
        idempotencyKey: `gmail-${mailbox.id}-${payload.historyId}`,
      }
    );
    console.info("[gmail-webhook] enqueued ingest", {
      mailboxId: mailbox.id,
      emailAddress: payload.emailAddress,
      historyId: payload.historyId,
      pubsubMessageId: envelope.message.messageId,
    });
  } else {
    console.info("[gmail-webhook] push received (shadow mode, ingest disabled)", {
      mailboxId: mailbox.id,
      emailAddress: payload.emailAddress,
      historyId: payload.historyId,
      pubsubMessageId: envelope.message.messageId,
    });
  }

  return Response.json({ ok: true });
}
