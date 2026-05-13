import { and, eq, gte, isNull, notInArray } from "drizzle-orm";
import { schedules, logger } from "./client";
import {
  db as defaultDb,
  engagements,
  followUpWatchers,
  interactions,
} from "@strvx/db";
import { reportTaskError } from "./_sentry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StalePipelineOutcome = "inserted" | "throttled" | "recent_activity";

export type StalePipelineResult = {
  engagementId: string;
  outcome: StalePipelineOutcome;
  daysIdle: number;
};

export type RunStalePipelineArgs = {
  db?: typeof defaultDb;
  now?: Date;
  /** Number of days without any interaction to count as stale. Default 14. */
  staleDays?: number;
  /** Per-engagement throttle for stale_pipeline watchers. Default 14 days. */
  throttleDays?: number;
};

export type RunStalePipelineResult = {
  candidates: number;
  results: StalePipelineResult[];
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Daily sweep that flags engagements stuck in an active stage without any
 * interaction for `staleDays` days. We insert a `stale_pipeline` follow-up
 * watcher per qualifying engagement; the watcher fires immediately (the
 * follow-up.fire dispatcher treats stale_pipeline as surface-only — it does
 * not invoke the planner).
 */
export async function runStalePipelineCron(
  args: RunStalePipelineArgs = {}
): Promise<RunStalePipelineResult> {
  const db = args.db ?? defaultDb;
  const now = args.now ?? new Date();
  const staleDays = args.staleDays ?? 14;
  const throttleDays = args.throttleDays ?? 14;

  const staleCutoff = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
  const throttleCutoff = new Date(
    now.getTime() - throttleDays * 24 * 60 * 60 * 1000
  );

  // 1. Find active, non-archived engagements.
  const activeEngagements = (await db
    .select({
      id: engagements.id,
      stageEnteredAt: engagements.stageEnteredAt,
    })
    .from(engagements)
    .where(
      and(
        notInArray(engagements.stage, ["closed_won", "closed_lost"]),
        isNull(engagements.archivedAt)
      )
    )) as Array<{ id: string; stageEnteredAt: Date }>;

  const results: StalePipelineResult[] = [];

  for (const e of activeEngagements) {
    // 2a. Skip if there's been an interaction in the last staleDays.
    const [recent] = await db
      .select({ id: interactions.id })
      .from(interactions)
      .where(
        and(
          eq(interactions.engagementId, e.id),
          gte(interactions.createdAt, staleCutoff)
        )
      )
      .limit(1);

    if (recent) {
      results.push({
        engagementId: e.id,
        outcome: "recent_activity",
        daysIdle: 0,
      });
      continue;
    }

    // 2b. Skip if a stale_pipeline watcher fired within the throttle window.
    const [throttled] = await db
      .select({ id: followUpWatchers.id })
      .from(followUpWatchers)
      .where(
        and(
          eq(followUpWatchers.kind, "stale_pipeline"),
          eq(followUpWatchers.engagementId, e.id),
          gte(followUpWatchers.firedAt, throttleCutoff)
        )
      )
      .limit(1);

    if (throttled) {
      const ageMs = now.getTime() - e.stageEnteredAt.getTime();
      results.push({
        engagementId: e.id,
        outcome: "throttled",
        daysIdle: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
      });
      continue;
    }

    // 3. Insert. We use stageEnteredAt as a fallback idle-age signal since
    //    "no interactions at all" produces undefined days-since-last otherwise.
    const ageMs = now.getTime() - e.stageEnteredAt.getTime();
    const daysIdle = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    await db.insert(followUpWatchers).values({
      kind: "stale_pipeline",
      threadId: null,
      engagementId: e.id,
      triggerAfter: now,
      status: "pending",
      ruleConfig: {
        origin: "stale_pipeline_cron",
        days_idle: daysIdle,
      },
    });
    results.push({ engagementId: e.id, outcome: "inserted", daysIdle });
  }

  return { candidates: activeEngagements.length, results };
}

// ---------------------------------------------------------------------------
// Trigger.dev cron schedule
// ---------------------------------------------------------------------------

/**
 * 15:00 UTC = 08:00 PT during PST (07:00 PT during PDT). Daylight drift
 * acceptable for a daily hygiene job.
 */
export const followUpStalePipeline = schedules.task({
  id: "follow_up.stale_pipeline",
  cron: "0 15 * * *",
  run: async () => {
    try {
      const result = await runStalePipelineCron({});
      logger.info("follow_up.stale_pipeline tick", {
        candidates: result.candidates,
        inserted: result.results.filter((r) => r.outcome === "inserted").length,
        throttled: result.results.filter((r) => r.outcome === "throttled").length,
        recentActivity: result.results.filter(
          (r) => r.outcome === "recent_activity"
        ).length,
      });
      return result;
    } catch (err) {
      reportTaskError("follow_up.stale_pipeline", err);
      throw err;
    }
  },
});
