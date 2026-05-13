import { google } from "googleapis";
import { task, logger } from "./client";
import { db } from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { backfillMailbox } from "@/lib/agent/gmail/backfill";
import { reportTaskError } from "./_sentry";

export const gmailBackfill = task({
  id: "gmail.backfill",
  retry: { maxAttempts: 2 },
  queue: { name: "gmail-backfill", concurrencyLimit: 2 },
  run: async (payload: { mailboxId: string; daysBack?: number }) => {
    try {
      return await runBackfill(payload);
    } catch (err) {
      reportTaskError("gmail.backfill", err, {
        mailboxId: payload.mailboxId,
        extras: { daysBack: payload.daysBack ?? 30 },
      });
      throw err;
    }
  },
});

async function runBackfill(payload: { mailboxId: string; daysBack?: number }) {
  logger.info("Backfilling mailbox", {
    mailboxId: payload.mailboxId,
    daysBack: payload.daysBack ?? 30,
  });

  const safe = await getAuthedMailboxClientSafe(payload.mailboxId);
  if (!safe.ok) {
    if (safe.error === "transient") {
      // Let Trigger.dev retry the task.
      throw new Error(
        `gmail.backfill: transient OAuth failure for ${payload.mailboxId}: ${safe.message}`
      );
    }
    // disconnected / not_found — log + return without retrying.
    logger.warn("gmail.backfill: skipping disconnected mailbox", {
      mailboxId: payload.mailboxId,
      error: safe.error,
      message: safe.message,
    });
    return {
      skipped: true,
      reason: safe.error,
      messagesIngested: 0,
      latestHistoryId: null,
    };
  }

  const gmail = google.gmail({ version: "v1", auth: safe.client });

  const result = await backfillMailbox({
    mailboxId: payload.mailboxId,
    db,
    gmail,
    daysBack: payload.daysBack ?? 30,
  });

  logger.info("Backfill complete", {
    mailboxId: payload.mailboxId,
    messagesIngested: result.messagesIngested,
    latestHistoryId: result.latestHistoryId,
  });

  return result;
}
