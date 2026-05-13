import { and, eq, gte, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { schedules, logger } from "./client";
import {
  db as defaultDb,
  emailThreads,
  followUpWatchers,
} from "@strvx/db";
import { reportTaskError } from "./_sentry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StaleThreadCandidate = {
  threadId: string;
  engagementId: string | null;
  lastOutboundAt: Date;
};

export type StaleThreadOutcome =
  | "inserted"
  | "throttled"
  | "already_pending";

export type StaleThreadResult = {
  threadId: string;
  outcome: StaleThreadOutcome;
  daysSinceOutbound: number;
};

export type RunStaleThreadsArgs = {
  db?: typeof defaultDb;
  now?: Date;
  /**
   * Minimum days since the last outbound message before we consider the
   * thread stale. Defaults to 3. Threshold lives here to keep tests cheap.
   */
  staleDays?: number;
  /**
   * Per-engagement throttle window (days). A new watcher is suppressed when
   * any prior `stale_thread` watcher for the same engagement (or thread, if
   * un-linked) fired within this window. Defaults to 14.
   */
  throttleDays?: number;
};

export type RunStaleThreadsResult = {
  candidates: number;
  results: StaleThreadResult[];
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Sweep email threads that have been waiting on an inbound reply for too long.
 * For each candidate, insert a `stale_thread` follow-up watcher unless a
 * watcher for the same engagement/thread was already fired inside the
 * throttle window or a pending stale_thread watcher already exists.
 */
export async function runStaleThreadsCron(
  args: RunStaleThreadsArgs = {}
): Promise<RunStaleThreadsResult> {
  const db = args.db ?? defaultDb;
  const now = args.now ?? new Date();
  const staleDays = args.staleDays ?? 3;
  const throttleDays = args.throttleDays ?? 14;

  const staleCutoff = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
  const throttleCutoff = new Date(
    now.getTime() - throttleDays * 24 * 60 * 60 * 1000
  );

  // 1. Find candidate threads.
  const candidates = (await db
    .select({
      threadId: emailThreads.id,
      engagementId: emailThreads.engagementId,
      lastOutboundAt: emailThreads.lastOutboundAt,
      lastInboundAt: emailThreads.lastInboundAt,
    })
    .from(emailThreads)
    .where(
      and(
        isNotNull(emailThreads.lastOutboundAt),
        or(
          sql`${emailThreads.lastInboundAt} IS NULL`,
          sql`${emailThreads.lastOutboundAt} > ${emailThreads.lastInboundAt}`
        ),
        sql`${emailThreads.lastOutboundAt} < ${staleCutoff}`,
        notInArray(emailThreads.agentState, ["snoozed", "archived"])
      )
    )) as Array<{
    threadId: string;
    engagementId: string | null;
    lastOutboundAt: Date | null;
    lastInboundAt: Date | null;
  }>;

  const results: StaleThreadResult[] = [];

  for (const c of candidates) {
    if (!c.lastOutboundAt) continue;

    const daysSinceOutbound = Math.floor(
      (now.getTime() - c.lastOutboundAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    // 2a. Skip if a stale_thread watcher fired for this engagement/thread
    //     within the throttle window.
    const throttleWhere = c.engagementId
      ? and(
          eq(followUpWatchers.kind, "stale_thread"),
          eq(followUpWatchers.engagementId, c.engagementId),
          isNotNull(followUpWatchers.firedAt),
          gte(followUpWatchers.firedAt, throttleCutoff)
        )
      : and(
          eq(followUpWatchers.kind, "stale_thread"),
          eq(followUpWatchers.threadId, c.threadId),
          isNotNull(followUpWatchers.firedAt),
          gte(followUpWatchers.firedAt, throttleCutoff)
        );

    const [throttled] = await db
      .select({ id: followUpWatchers.id })
      .from(followUpWatchers)
      .where(throttleWhere)
      .limit(1);

    if (throttled) {
      results.push({
        threadId: c.threadId,
        outcome: "throttled",
        daysSinceOutbound,
      });
      continue;
    }

    // 2b. Skip if a pending stale_thread watcher for the same thread already
    //     exists. Idempotency.
    const [pending] = await db
      .select({ id: followUpWatchers.id })
      .from(followUpWatchers)
      .where(
        and(
          eq(followUpWatchers.kind, "stale_thread"),
          eq(followUpWatchers.threadId, c.threadId),
          eq(followUpWatchers.status, "pending")
        )
      )
      .limit(1);

    if (pending) {
      results.push({
        threadId: c.threadId,
        outcome: "already_pending",
        daysSinceOutbound,
      });
      continue;
    }

    // 3. Insert.
    await db.insert(followUpWatchers).values({
      kind: "stale_thread",
      threadId: c.threadId,
      engagementId: c.engagementId,
      triggerAfter: now,
      status: "pending",
      ruleConfig: {
        origin: "stale_threads_cron",
        days_since_outbound: daysSinceOutbound,
      },
    });

    results.push({
      threadId: c.threadId,
      outcome: "inserted",
      daysSinceOutbound,
    });
  }

  return { candidates: candidates.length, results };
}

// ---------------------------------------------------------------------------
// Trigger.dev cron schedule
// ---------------------------------------------------------------------------

export const followUpStaleThreads = schedules.task({
  id: "follow_up.stale_threads",
  cron: "0 * * * *", // hourly
  run: async () => {
    try {
      const result = await runStaleThreadsCron({});
      logger.info("follow_up.stale_threads tick", {
        candidates: result.candidates,
        inserted: result.results.filter((r) => r.outcome === "inserted").length,
        throttled: result.results.filter((r) => r.outcome === "throttled").length,
        alreadyPending: result.results.filter(
          (r) => r.outcome === "already_pending"
        ).length,
      });
      return result;
    } catch (err) {
      reportTaskError("follow_up.stale_threads", err);
      throw err;
    }
  },
});
