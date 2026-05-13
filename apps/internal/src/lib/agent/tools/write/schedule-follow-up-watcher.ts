import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { emailThreads, followUpWatchers } from "@strvx/db";
import type { ToolDefinition } from "../types";

/**
 * Input shape for `schedule_follow_up_watcher`. `rule_config` carries the
 * kind-specific extras (e.g. calendar_event_id, engagement_id) — see the
 * `handle` body for which fields each kind requires.
 */
const inputSchema = z.object({
  kind: z.enum([
    "stale_thread",
    "stale_pipeline",
    "no_show",
    "post_meeting_followup",
  ]),
  trigger_after: z.string().datetime(),
  rule_config: z.record(z.string(), z.unknown()).default({}),
});

type ScheduleFollowUpWatcherInput = z.infer<typeof inputSchema>;

export type ScheduleFollowUpWatcherOutput =
  | { watcher_id: string; already_existed: boolean }
  | { error: string };

function pickString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export const scheduleFollowUpWatcherTool: ToolDefinition<
  ScheduleFollowUpWatcherInput,
  ScheduleFollowUpWatcherOutput
> = {
  name: "schedule_follow_up_watcher",
  description:
    "Schedules a background watcher row that will fire a follow-up suggestion later. Idempotent: re-running for the same (kind, thread, engagement, calendar event) returns the existing pending watcher. Use kinds: post_meeting_followup (needs calendar_event_id in rule_config), no_show (needs calendar_event_id), stale_thread (uses current thread), stale_pipeline (needs engagement_id in rule_config, or uses thread's engagement).",
  inputSchema,
  async handle(input, ctx) {
    const triggerAfter = new Date(input.trigger_after);
    if (Number.isNaN(triggerAfter.getTime())) {
      return { error: "invalid_trigger_after" };
    }

    // Look up the current thread once — we always link the watcher to it,
    // and use its engagement as a default when the caller doesn't supply one.
    const [thread] = await ctx.db
      .select({
        id: emailThreads.id,
        mailboxId: emailThreads.mailboxId,
        engagementId: emailThreads.engagementId,
      })
      .from(emailThreads)
      .where(eq(emailThreads.id, ctx.threadId))
      .limit(1);

    if (!thread) return { error: "thread_not_found" };
    if (thread.mailboxId !== ctx.mailboxId) {
      return { error: "thread_belongs_to_other_mailbox" };
    }

    // Resolve kind-specific required fields.
    let calendarEventId: string | null = null;
    let engagementId: string | null = thread.engagementId ?? null;

    switch (input.kind) {
      case "post_meeting_followup":
      case "no_show": {
        const evt = pickString(input.rule_config, "calendar_event_id");
        if (!evt) {
          return {
            error: `${input.kind} requires rule_config.calendar_event_id`,
          };
        }
        calendarEventId = evt;
        break;
      }
      case "stale_pipeline": {
        const provided = pickString(input.rule_config, "engagement_id");
        engagementId = provided ?? engagementId;
        if (!engagementId) {
          return {
            error:
              "stale_pipeline requires rule_config.engagement_id (or a thread linked to an engagement)",
          };
        }
        break;
      }
      case "stale_thread": {
        // Uses ctx.threadId. No extra required fields.
        break;
      }
    }

    // Idempotency: scope to (kind, mailbox, thread, engagement, calendar event)
    // and treat only PENDING watchers as duplicates so a fired watcher doesn't
    // block re-arming.
    const idempotencyConditions = [
      eq(followUpWatchers.kind, input.kind),
      eq(followUpWatchers.status, "pending"),
    ];

    // thread_id scope: stale_thread + post_meeting_followup + no_show all
    // link to the current thread.
    if (
      input.kind === "stale_thread" ||
      input.kind === "post_meeting_followup" ||
      input.kind === "no_show"
    ) {
      idempotencyConditions.push(eq(followUpWatchers.threadId, thread.id));
    }

    // engagement_id scope: stale_pipeline keys off it; tolerate
    // null-vs-set differences for thread-keyed kinds.
    if (input.kind === "stale_pipeline") {
      // engagementId is guaranteed non-null above.
      idempotencyConditions.push(
        eq(followUpWatchers.engagementId, engagementId as string)
      );
    }

    if (calendarEventId) {
      idempotencyConditions.push(
        eq(followUpWatchers.calendarEventId, calendarEventId)
      );
    } else if (input.kind === "stale_thread" || input.kind === "stale_pipeline") {
      // For non-calendar kinds, prefer to match watchers whose
      // calendar_event_id IS NULL — otherwise a meeting-keyed watcher could
      // mask a thread-only one and vice versa.
      idempotencyConditions.push(isNull(followUpWatchers.calendarEventId));
    }

    const [existing] = await ctx.db
      .select({ id: followUpWatchers.id })
      .from(followUpWatchers)
      .where(and(...idempotencyConditions))
      .limit(1);

    if (existing) {
      return { watcher_id: existing.id, already_existed: true };
    }

    // Build the row. rule_config is preserved as-is so per-kind extras
    // (recipient hints, no_show grace window, etc.) survive into the worker.
    const [inserted] = await ctx.db
      .insert(followUpWatchers)
      .values({
        kind: input.kind,
        threadId:
          input.kind === "stale_pipeline" && !calendarEventId
            ? null
            : thread.id,
        engagementId,
        calendarEventId,
        triggerAfter,
        status: "pending",
        ruleConfig: input.rule_config,
      })
      .returning({ id: followUpWatchers.id });

    return { watcher_id: inserted.id, already_existed: false };
  },
};

// Re-export for callers that want to enumerate valid kinds.
export const SCHEDULE_FOLLOW_UP_WATCHER_KINDS = [
  "stale_thread",
  "stale_pipeline",
  "no_show",
  "post_meeting_followup",
] as const;
