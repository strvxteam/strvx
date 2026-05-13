import { and, eq, isNotNull, lte } from "drizzle-orm";
import { schedules, logger } from "./client";
import { db as defaultDb, emailThreads } from "@strvx/db";
import { reportTaskError } from "./_sentry";

export type RunUnsnoozeArgs = {
  db?: typeof defaultDb;
  now?: Date;
};

export type RunUnsnoozeResult = {
  count: number;
  threadIds: string[];
};

/**
 * Wake up snoozed threads whose `snoozed_until` has elapsed. Flips them
 * back to agent_state='classified' (the standard re-entry state) and
 * clears `snoozed_until`. We update one row at a time so we get a stable
 * list of affected ids without relying on RETURNING in tests.
 */
export async function runUnsnoozeThreads(
  args: RunUnsnoozeArgs = {}
): Promise<RunUnsnoozeResult> {
  const db = args.db ?? defaultDb;
  const now = args.now ?? new Date();

  const due = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.agentState, "snoozed"),
        isNotNull(emailThreads.snoozedUntil),
        lte(emailThreads.snoozedUntil, now)
      )
    );

  const ids: string[] = due.map((r) => r.id);

  for (const id of ids) {
    await db
      .update(emailThreads)
      .set({
        agentState: "classified",
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(eq(emailThreads.id, id));
  }

  if (ids.length > 0) {
    logger.info("unsnooze-threads: woke threads", { count: ids.length });
  }

  return { count: ids.length, threadIds: ids };
}

export const unsnoozeThreads = schedules.task({
  id: "unsnooze.threads",
  cron: "*/15 * * * *",
  run: async () => {
    try {
      const result = await runUnsnoozeThreads({});
      logger.info("unsnooze.threads tick", { count: result.count });
      return result;
    } catch (err) {
      reportTaskError("unsnooze.threads", err);
      throw err;
    }
  },
});
