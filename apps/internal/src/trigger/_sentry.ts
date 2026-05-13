import * as Sentry from "@sentry/nextjs";

/**
 * Per-task tags & extras attached to every Sentry event we emit from
 * inside a Trigger.dev task. All fields optional except `taskId`.
 *
 * Keep this struct flat — Sentry's tag UI works best with scalar values.
 */
export type TaskErrorTags = {
  taskId: string;
  mailboxId?: string;
  threadId?: string;
  cosRunId?: string;
  /** Free-form extra payload — goes into Sentry "extra", not searchable tags. */
  extras?: Record<string, unknown>;
};

/**
 * Capture an error from a Trigger.dev task into Sentry with task-aware
 * tags. Safe to call when SENTRY_DSN isn't set — Sentry.init is gated
 * on NODE_ENV=production, so this is a no-op in tests / dev.
 *
 * Note: this swallows any error from Sentry itself so the task's
 * upstream handler (which decides whether to rethrow) keeps its own
 * control flow.
 */
export function reportTaskError(
  taskId: string,
  err: unknown,
  meta: Omit<TaskErrorTags, "taskId"> = {}
): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTag("trigger.task_id", taskId);
      if (meta.mailboxId) scope.setTag("agent.mailbox_id", meta.mailboxId);
      if (meta.threadId) scope.setTag("agent.thread_id", meta.threadId);
      if (meta.cosRunId) scope.setTag("agent.cos_run_id", meta.cosRunId);
      if (meta.extras) scope.setExtras(meta.extras);
      scope.setLevel("error");
      Sentry.captureException(err);
    });
  } catch {
    // Never let Sentry instrumentation crash a task.
  }
}

/**
 * Lightweight breadcrumb for caught-but-handled failures (the cos_runs
 * row was written with status='failed', for example). These show up in
 * the next captured event's timeline.
 */
export function recordCosRunFailedBreadcrumb(meta: {
  taskId: string;
  cosRunId: string;
  mailboxId?: string;
  threadId?: string;
  reason?: string;
}): void {
  try {
    Sentry.addBreadcrumb({
      category: "cos.run",
      level: "warning",
      message: `cos_runs.status=failed (${meta.taskId})`,
      data: {
        cosRunId: meta.cosRunId,
        mailboxId: meta.mailboxId,
        threadId: meta.threadId,
        reason: meta.reason,
      },
    });
  } catch {
    // Never let Sentry instrumentation crash a task.
  }
}
