import { google } from "googleapis";
import { task, logger } from "./client";
import { db } from "@strvx/db";
import { getAuthedMailboxClient } from "@/lib/agent/mailbox-oauth";
import {
  ingestMailboxSince,
  HistoryCursorExpiredError,
} from "@/lib/agent/gmail/ingest";
import { agentClassifyMessage } from "./agent-classify-message";
import { gmailBackfill } from "./gmail-backfill";
import { reportTaskError } from "./_sentry";

export const gmailMessageReceived = task({
  id: "gmail.message.received",
  retry: { maxAttempts: 3 },
  // One ingest run per mailbox at a time (Gmail history is sequential).
  queue: { name: "gmail-ingest", concurrencyLimit: 10 },
  run: async (payload: { mailboxId: string; historyIdHint?: string }) => {
    try {
      logger.info("Ingesting mailbox", { mailboxId: payload.mailboxId });

      const { client } = await getAuthedMailboxClient(payload.mailboxId);
      const gmail = google.gmail({ version: "v1", auth: client });

      try {
        const result = await ingestMailboxSince({
          mailboxId: payload.mailboxId,
          db,
          gmail,
        });

        // Fan out classification for every newly-ingested message.
        for (const id of result.newMessageIds) {
          await agentClassifyMessage.trigger({ messageId: id });
        }

        logger.info("Ingest complete", {
          mailboxId: payload.mailboxId,
          ingested: result.newMessageIds.length,
          deleted: result.deletedCount,
          labelUpdates: result.labelUpdates,
          newHistoryId: result.newHistoryId,
        });

        return {
          ingested: result.newMessageIds.length,
          deleted: result.deletedCount,
          labelUpdates: result.labelUpdates,
        };
      } catch (err) {
        if (err instanceof HistoryCursorExpiredError) {
          logger.warn("History cursor expired — falling back to backfill", {
            mailboxId: payload.mailboxId,
          });
          await gmailBackfill.trigger({ mailboxId: payload.mailboxId });
          return { ingested: 0, fallbackBackfill: true };
        }
        throw err;
      }
    } catch (err) {
      reportTaskError("gmail.message.received", err, {
        mailboxId: payload.mailboxId,
        extras: { historyIdHint: payload.historyIdHint },
      });
      throw err;
    }
  },
});
