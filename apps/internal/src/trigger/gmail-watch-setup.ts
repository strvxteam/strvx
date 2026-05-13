import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { task, logger } from "./client";
import { db, mailboxWatches } from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { setupGmailWatch } from "@/lib/agent/gmail/watch";
import { reportTaskError } from "./_sentry";

export const gmailWatchSetup = task({
  id: "gmail.watch.setup",
  retry: { maxAttempts: 3 },
  run: async (payload: { mailboxId: string }) => {
    try {
      return await runWatchSetup(payload);
    } catch (err) {
      reportTaskError("gmail.watch.setup", err, {
        mailboxId: payload.mailboxId,
      });
      throw err;
    }
  },
});

async function runWatchSetup(payload: { mailboxId: string }) {
  logger.info("Setting up Gmail watch", { mailboxId: payload.mailboxId });

  const safe = await getAuthedMailboxClientSafe(payload.mailboxId);
  if (!safe.ok) {
    if (safe.error === "transient") {
      throw new Error(
        `gmail.watch.setup: transient OAuth failure for ${payload.mailboxId}: ${safe.message}`
      );
    }
    logger.warn("gmail.watch.setup: skipping disconnected mailbox", {
      mailboxId: payload.mailboxId,
      error: safe.error,
      message: safe.message,
    });
    return { skipped: true, reason: safe.error };
  }

  const gmail = google.gmail({ version: "v1", auth: safe.client });

  const result = await setupGmailWatch({
    gmail,
    mailboxId: payload.mailboxId,
  });

  const topic = process.env.GOOGLE_PUBSUB_TOPIC!;

  const [existing] = await db
    .select()
    .from(mailboxWatches)
    .where(eq(mailboxWatches.mailboxId, payload.mailboxId))
    .limit(1);

  if (existing) {
    await db
      .update(mailboxWatches)
      .set({
        historyId: result.historyId,
        expiration: result.expiration,
        topicName: topic,
        lastRenewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mailboxWatches.id, existing.id));
  } else {
    await db.insert(mailboxWatches).values({
      mailboxId: payload.mailboxId,
      historyId: result.historyId,
      expiration: result.expiration,
      topicName: topic,
      lastRenewedAt: new Date(),
    });
  }

  logger.info("Gmail watch set up", {
    mailboxId: payload.mailboxId,
    historyId: result.historyId,
    expiration: result.expiration.toISOString(),
  });

  return {
    historyId: result.historyId,
    expiration: result.expiration.toISOString(),
  };
}
