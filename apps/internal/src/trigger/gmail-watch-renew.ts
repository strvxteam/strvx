import { lt, eq, and } from "drizzle-orm";
import { schedules, logger } from "./client";
import { db, mailboxOauthTokens, mailboxWatches } from "@strvx/db";
import { gmailWatchSetup } from "./gmail-watch-setup";
import { reportTaskError } from "./_sentry";

/**
 * Daily cron at 02:00 UTC. For every mailbox with a watch expiring within
 * 48 hours, re-trigger setup (Gmail's watch API call returns a fresh
 * historyId and expiration).
 */
export const gmailWatchRenew = schedules.task({
  id: "gmail.watch.renew",
  cron: "0 2 * * *",
  run: async () => {
    try {
      const cutoff = new Date(Date.now() + 48 * 3600 * 1000);

      const rows = await db
        .select({
          id: mailboxWatches.id,
          mailboxId: mailboxWatches.mailboxId,
          expiration: mailboxWatches.expiration,
        })
        .from(mailboxWatches)
        .innerJoin(
          mailboxOauthTokens,
          eq(mailboxWatches.mailboxId, mailboxOauthTokens.id)
        )
        .where(
          and(
            lt(mailboxWatches.expiration, cutoff),
            eq(mailboxOauthTokens.isActive, true)
          )
        );

      logger.info(`Renewing ${rows.length} mailbox watch(es)`);

      for (const row of rows) {
        await gmailWatchSetup.trigger({ mailboxId: row.mailboxId });
      }

      return { renewedCount: rows.length };
    } catch (err) {
      reportTaskError("gmail.watch.renew", err);
      throw err;
    }
  },
});
