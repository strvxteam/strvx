import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { google } from "googleapis";
import { schedules, logger } from "./client";
import {
  db as defaultDb,
  calendarEvents,
  emailThreads,
  followUpWatchers,
  interactions,
  mailboxOauthTokens,
} from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import { extractActionsFromNotes } from "@/lib/agent/follow-up/extract-actions";
import { getOpenAI } from "@/lib/agent/openai-client";
import { agentPlanThread } from "./agent-plan-thread";
import type { SeedIntent } from "@/lib/agent/reasoning/plan-thread";
import { reportTaskError } from "./_sentry";

// ---------------------------------------------------------------------------
// Types & extension points (injected in tests)
// ---------------------------------------------------------------------------

type WatcherRow = {
  id: string;
  kind: string;
  threadId: string | null;
  engagementId: string | null;
  calendarEventId: string | null;
  triggerAfter: Date;
  ruleConfig: unknown;
  status: string;
};

export type FollowUpFireOk = {
  watcherId: string;
  kind: string;
  outcome:
    | "fired_with_actions"
    | "fired_no_notes"
    | "fired_planner_dispatched"
    | "fired_no_planner"
    | "skipped_unhandled_kind"
    | "skipped_no_event"
    | "skipped_no_thread"
    | "error";
  insertedActionCount?: number;
  error?: string;
};

/** Hook used to fire a planThread run; tests inject a spy here. */
export type PlanThreadDispatcher = (input: {
  threadId: string;
  seedIntent: SeedIntent;
}) => Promise<void>;

const defaultPlanThreadDispatcher: PlanThreadDispatcher = async (input) => {
  await agentPlanThread.trigger({
    threadId: input.threadId,
    seedIntent: input.seedIntent,
  });
};

export type RunFollowUpFireArgs = {
  db?: typeof defaultDb;
  now?: Date;
  /** Inject the extract-actions fn so tests don't hit OpenAI. */
  extractActions?: typeof extractActionsFromNotes;
  /** Inject a "fetch event end time from Google" hook for tests. */
  fetchEventEndAt?: (
    calendarEventId: string,
    db: typeof defaultDb
  ) => Promise<Date | null>;
  /** Inject the planThread.trigger call. */
  planThreadDispatcher?: PlanThreadDispatcher;
  openai?: ReturnType<typeof getOpenAI>;
};

export type RunFollowUpFireResult = {
  processed: number;
  results: FollowUpFireOk[];
};

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

/**
 * Sweep due `follow_up_watchers` rows and fire them by kind. Errors per-row
 * are logged + recorded on the watcher (status=cancelled, ruleConfig.error)
 * but never bubble — one bad watcher cannot sink the batch.
 *
 * Phase-3 scope: only `post_meeting_followup` is handled. Other kinds are
 * left at status=pending with a log entry for Phase 4.
 */
export async function runFollowUpFire(
  args: RunFollowUpFireArgs = {}
): Promise<RunFollowUpFireResult> {
  const db = args.db ?? defaultDb;
  const now = args.now ?? new Date();
  const extractActions = args.extractActions ?? extractActionsFromNotes;
  const fetchEventEndAt = args.fetchEventEndAt ?? defaultFetchEventEndAt;
  const planThreadDispatcher =
    args.planThreadDispatcher ?? defaultPlanThreadDispatcher;

  const due = (await db
    .select({
      id: followUpWatchers.id,
      kind: followUpWatchers.kind,
      threadId: followUpWatchers.threadId,
      engagementId: followUpWatchers.engagementId,
      calendarEventId: followUpWatchers.calendarEventId,
      triggerAfter: followUpWatchers.triggerAfter,
      ruleConfig: followUpWatchers.ruleConfig,
      status: followUpWatchers.status,
    })
    .from(followUpWatchers)
    .where(
      and(
        eq(followUpWatchers.status, "pending"),
        lte(followUpWatchers.triggerAfter, now)
      )
    )) as WatcherRow[];

  const results: FollowUpFireOk[] = [];

  for (const w of due) {
    try {
      let outcome: FollowUpFireOk;
      switch (w.kind) {
        case "post_meeting_followup":
          outcome = await firePostMeetingWatcher({
            db,
            watcher: w,
            extractActions,
            fetchEventEndAt,
            openai: args.openai,
          });
          break;
        case "stale_thread":
          outcome = await fireStaleThreadWatcher({
            db,
            watcher: w,
            planThreadDispatcher,
          });
          break;
        case "stale_pipeline":
          outcome = await fireStalePipelineWatcher({ db, watcher: w });
          break;
        case "no_show":
          outcome = await fireNoShowWatcher({
            db,
            watcher: w,
            planThreadDispatcher,
          });
          break;
        default:
          logger.info("follow-up-fire: skipping unhandled kind", {
            watcherId: w.id,
            kind: w.kind,
          });
          outcome = {
            watcherId: w.id,
            kind: w.kind,
            outcome: "skipped_unhandled_kind",
          };
      }
      results.push(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("follow-up-fire: unexpected error", {
        watcherId: w.id,
        err: message,
      });
      await db
        .update(followUpWatchers)
        .set({
          status: "cancelled",
          ruleConfig: sql`COALESCE(${followUpWatchers.ruleConfig}, '{}'::jsonb) || ${JSON.stringify({ error: message })}::jsonb`,
        })
        .where(eq(followUpWatchers.id, w.id));
      results.push({
        watcherId: w.id,
        kind: w.kind,
        outcome: "error",
        error: message,
      });
    }
  }

  return { processed: due.length, results };
}

// ---------------------------------------------------------------------------
// post_meeting_followup handler
// ---------------------------------------------------------------------------

async function firePostMeetingWatcher(args: {
  db: typeof defaultDb;
  watcher: WatcherRow;
  extractActions: typeof extractActionsFromNotes;
  fetchEventEndAt: (
    calendarEventId: string,
    db: typeof defaultDb
  ) => Promise<Date | null>;
  openai?: ReturnType<typeof getOpenAI>;
}): Promise<FollowUpFireOk> {
  const { db, watcher, extractActions, fetchEventEndAt } = args;
  const calendarEventId = watcher.calendarEventId;
  if (!calendarEventId) {
    logger.warn("follow-up-fire: watcher has no calendar_event_id", {
      watcherId: watcher.id,
    });
    await db
      .update(followUpWatchers)
      .set({
        status: "cancelled",
        ruleConfig: sql`COALESCE(${followUpWatchers.ruleConfig}, '{}'::jsonb) || ${JSON.stringify({ error: "missing_calendar_event_id" })}::jsonb`,
      })
      .where(eq(followUpWatchers.id, watcher.id));
    return {
      watcherId: watcher.id,
      kind: watcher.kind,
      outcome: "skipped_no_event",
    };
  }

  // Resolve the meeting end time. Used to gate which interactions count as
  // post-meeting notes.
  const eventEndAt =
    (await fetchEventEndAt(calendarEventId, db)) ?? watcher.triggerAfter;
  // The watcher's trigger_after is end + 1h, so eventEndAt = trigger - 1h
  // is a safe fallback when we can't recover the real end.
  const noteThreshold = new Date(
    Math.max(
      eventEndAt.getTime() - 30 * 60 * 1000, // tolerate notes saved a bit before
      0
    )
  );

  // Look up notes interactions written after the meeting end, for this
  // engagement. If no engagement is linked, we can't safely mine notes.
  let notesText = "";
  let mailboxId: string | null = null;

  if (watcher.engagementId) {
    const notes = await db
      .select({
        type: interactions.type,
        content: interactions.content,
        createdAt: interactions.createdAt,
      })
      .from(interactions)
      .where(
        and(
          eq(interactions.engagementId, watcher.engagementId),
          inArray(interactions.type, ["note", "meeting"]),
          gt(interactions.createdAt, noteThreshold)
        )
      )
      .orderBy(desc(interactions.createdAt))
      .limit(10);

    notesText = notes
      .map((n) => `[${n.type} @ ${n.createdAt.toISOString()}]\n${n.content}`)
      .join("\n\n");
  }

  // Resolve a mailbox for traceability on cos_runs, via the watcher's
  // thread (best-effort).
  if (watcher.threadId) {
    const [thread] = await db
      .select({ mailboxId: emailThreads.mailboxId })
      .from(emailThreads)
      .where(eq(emailThreads.id, watcher.threadId))
      .limit(1);
    mailboxId = thread?.mailboxId ?? null;
  }
  if (!mailboxId) {
    const [mb] = await db
      .select({ id: mailboxOauthTokens.id })
      .from(mailboxOauthTokens)
      .where(eq(mailboxOauthTokens.isActive, true))
      .limit(1);
    mailboxId = mb?.id ?? null;
  }

  if (!notesText.trim() || !watcher.engagementId) {
    // No notes — skip LLM, mark fired with rule_config.no_notes = true.
    await db
      .update(followUpWatchers)
      .set({
        status: "fired",
        firedAt: new Date(),
        ruleConfig: sql`COALESCE(${followUpWatchers.ruleConfig}, '{}'::jsonb) || ${JSON.stringify({ no_notes: true })}::jsonb`,
      })
      .where(eq(followUpWatchers.id, watcher.id));
    return {
      watcherId: watcher.id,
      kind: watcher.kind,
      outcome: "fired_no_notes",
    };
  }

  // Notes present — extract action items and fire.
  const result = await extractActions({
    db,
    openai: args.openai,
    engagementId: watcher.engagementId,
    notesText,
    mailboxId,
    calendarEventId,
  });
  await db
    .update(followUpWatchers)
    .set({
      status: "fired",
      firedAt: new Date(),
      ruleConfig: sql`COALESCE(${followUpWatchers.ruleConfig}, '{}'::jsonb) || ${JSON.stringify(
        {
          action_count: result.insertedActionIds.length,
          extract_cos_run_id: result.cosRunId,
        }
      )}::jsonb`,
    })
    .where(eq(followUpWatchers.id, watcher.id));

  return {
    watcherId: watcher.id,
    kind: watcher.kind,
    outcome: "fired_with_actions",
    insertedActionCount: result.insertedActionIds.length,
  };
}

// ---------------------------------------------------------------------------
// Default event-end-time lookup
// ---------------------------------------------------------------------------

/**
 * Resolve a meeting's end time. Strategy:
 *   1. Check our local `calendar_events` table for the google_event_id.
 *      We store date + startHour + durationHours (UTC) — combine.
 *   2. Otherwise, try Google Calendar `events.get` against the first active
 *      mailbox. Best-effort; returns null on failure.
 */
async function defaultFetchEventEndAt(
  calendarEventId: string,
  db: typeof defaultDb
): Promise<Date | null> {
  const [row] = await db
    .select({
      date: calendarEvents.date,
      startHour: calendarEvents.startHour,
      durationHours: calendarEvents.durationHours,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.googleEventId, calendarEventId))
    .limit(1);

  if (row) {
    const [y, m, d] = row.date.split("-").map((n) => parseInt(n, 10));
    const startHour = parseFloat(row.startHour);
    const durationHours = parseFloat(row.durationHours);
    const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) + startHour * 3600 * 1000;
    const endMs = startMs + durationHours * 3600 * 1000;
    return new Date(endMs);
  }

  // Fallback to Google Calendar API via the first active mailbox.
  const [mb] = await db
    .select({ id: mailboxOauthTokens.id })
    .from(mailboxOauthTokens)
    .where(eq(mailboxOauthTokens.isActive, true))
    .limit(1);
  if (!mb) return null;

  const safe = await getAuthedMailboxClientSafe(mb.id);
  if (!safe.ok) {
    if (safe.error === "transient") {
      // Transient → throw so Trigger.dev retries; per-watcher catch in
      // runFollowUpFire will mark this single row failed, but the retry
      // will pick the rest of the batch up on next tick.
      throw new Error(
        `follow-up-fire: transient OAuth failure: ${safe.message}`
      );
    }
    logger.warn("follow-up-fire: mailbox unavailable for events.get", {
      calendarEventId,
      mailboxId: mb.id,
      error: safe.error,
    });
    return null;
  }
  try {
    const calendar = google.calendar({ version: "v3", auth: safe.client });
    const resp = await calendar.events.get({
      calendarId: "primary",
      eventId: calendarEventId,
    });
    const end = resp.data.end?.dateTime ?? resp.data.end?.date ?? null;
    return end ? new Date(end) : null;
  } catch (err) {
    logger.warn("follow-up-fire: events.get failed", {
      calendarEventId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// stale_thread / stale_pipeline / no_show handlers
// ---------------------------------------------------------------------------

async function markFiredWithExtras(
  db: typeof defaultDb,
  watcherId: string,
  extras: Record<string, unknown>
): Promise<void> {
  await db
    .update(followUpWatchers)
    .set({
      status: "fired",
      firedAt: new Date(),
      ruleConfig: sql`COALESCE(${followUpWatchers.ruleConfig}, '{}'::jsonb) || ${JSON.stringify(extras)}::jsonb`,
    })
    .where(eq(followUpWatchers.id, watcherId));
}

async function fireStaleThreadWatcher(args: {
  db: typeof defaultDb;
  watcher: WatcherRow;
  planThreadDispatcher: PlanThreadDispatcher;
}): Promise<FollowUpFireOk> {
  const { db, watcher, planThreadDispatcher } = args;
  if (!watcher.threadId) {
    logger.warn("follow-up-fire: stale_thread watcher has no thread_id", {
      watcherId: watcher.id,
    });
    await db
      .update(followUpWatchers)
      .set({
        status: "cancelled",
        ruleConfig: sql`COALESCE(${followUpWatchers.ruleConfig}, '{}'::jsonb) || ${JSON.stringify({ skipped: "no_thread" })}::jsonb`,
      })
      .where(eq(followUpWatchers.id, watcher.id));
    return {
      watcherId: watcher.id,
      kind: watcher.kind,
      outcome: "skipped_no_thread",
    };
  }
  await planThreadDispatcher({
    threadId: watcher.threadId,
    seedIntent: "stale_followup",
  });
  await markFiredWithExtras(db, watcher.id, {
    dispatched: "stale_followup",
  });
  return {
    watcherId: watcher.id,
    kind: watcher.kind,
    outcome: "fired_planner_dispatched",
  };
}

async function fireStalePipelineWatcher(args: {
  db: typeof defaultDb;
  watcher: WatcherRow;
}): Promise<FollowUpFireOk> {
  const { db, watcher } = args;
  // Surface-only: mark fired without dispatching a planner run. The UI at
  // /agent/follow-ups will show this watcher and let a human decide.
  await markFiredWithExtras(db, watcher.id, { surface_only: true });
  return {
    watcherId: watcher.id,
    kind: watcher.kind,
    outcome: "fired_no_planner",
  };
}

async function fireNoShowWatcher(args: {
  db: typeof defaultDb;
  watcher: WatcherRow;
  planThreadDispatcher: PlanThreadDispatcher;
}): Promise<FollowUpFireOk> {
  const { db, watcher, planThreadDispatcher } = args;
  // Find a thread we can plan against — prefer one already linked to the
  // watcher; otherwise pick the most recent thread for the engagement.
  let threadId = watcher.threadId;
  if (!threadId && watcher.engagementId) {
    const [t] = await db
      .select({ id: emailThreads.id })
      .from(emailThreads)
      .where(eq(emailThreads.engagementId, watcher.engagementId))
      .orderBy(desc(emailThreads.lastMessageAt))
      .limit(1);
    threadId = t?.id ?? null;
  }
  if (!threadId) {
    await db
      .update(followUpWatchers)
      .set({
        status: "cancelled",
        ruleConfig: sql`COALESCE(${followUpWatchers.ruleConfig}, '{}'::jsonb) || ${JSON.stringify({ skipped: "no_thread" })}::jsonb`,
      })
      .where(eq(followUpWatchers.id, watcher.id));
    return {
      watcherId: watcher.id,
      kind: watcher.kind,
      outcome: "skipped_no_thread",
    };
  }
  await planThreadDispatcher({
    threadId,
    seedIntent: "no_show_followup",
  });
  await markFiredWithExtras(db, watcher.id, {
    dispatched: "no_show_followup",
    thread_id: threadId,
  });
  return {
    watcherId: watcher.id,
    kind: watcher.kind,
    outcome: "fired_planner_dispatched",
  };
}

// ---------------------------------------------------------------------------
// Trigger.dev cron schedule
// ---------------------------------------------------------------------------

export const followUpFire = schedules.task({
  id: "follow-up.fire",
  cron: "*/15 * * * *", // every 15 minutes
  run: async () => {
    try {
      const result = await runFollowUpFire({});
      logger.info("follow-up.fire tick", {
        processed: result.processed,
        results: result.results.map((r) => ({
          kind: r.kind,
          outcome: r.outcome,
        })),
      });
      return result;
    } catch (err) {
      reportTaskError("follow-up.fire", err);
      throw err;
    }
  },
});
