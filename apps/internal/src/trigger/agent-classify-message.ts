import { task, logger } from "./client";
import {
  db,
  agentClassifications,
  emailMessages,
} from "@strvx/db";
import { classifyMessage } from "@/lib/agent/classify/classify";
import { eq } from "drizzle-orm";
import { reportTaskError } from "./_sentry";

export const agentClassifyMessage = task({
  id: "agent.classify.message",
  retry: { maxAttempts: 3 },
  queue: { name: "agent-classify", concurrencyLimit: 20 },
  run: async (payload: { messageId: string }) => {
    try {
      // Skip if already classified (idempotency for duplicate triggers).
      const [existing] = await db
        .select({ id: agentClassifications.id })
        .from(agentClassifications)
        .where(eq(agentClassifications.messageId, payload.messageId))
        .limit(1);
      if (existing) {
        logger.info("Already classified — skipping", {
          messageId: payload.messageId,
        });
        return { skipped: true };
      }

      const result = await classifyMessage({
        messageId: payload.messageId,
        db,
      });

      logger.info("Classified", {
        messageId: payload.messageId,
        category: result.classification.category,
        urgency: result.classification.urgency,
        intent: result.classification.intent,
        cosRunId: result.cosRunId,
      });

      const reasoningIntents = new Set([
        "schedule",
        "reschedule",
        "cancel",
        "proposal_review",
      ]);
      const shouldPlan =
        result.classification.requires_reply ||
        reasoningIntents.has(result.classification.intent);

      if (shouldPlan) {
        const [msg] = await db
          .select({ threadId: emailMessages.threadId })
          .from(emailMessages)
          .where(eq(emailMessages.id, payload.messageId))
          .limit(1);
        if (msg) {
          // TODO(slice-5): trigger agentPlanThread once plan-thread.ts is
          // ported (see apps/internal/src/lib/agent/reasoning/PLAN_THREAD_TODO.md).
          // For now we just record that the planner would have fired.
          logger.info("Would enqueue planner (deferred to slice 5)", {
            messageId: payload.messageId,
            threadId: msg.threadId,
          });
        }
      }

      return {
        classificationId: result.agentClassificationId,
        category: result.classification.category,
      };
    } catch (err) {
      reportTaskError("agent.classify.message", err, {
        extras: { messageId: payload.messageId },
      });
      throw err;
    }
  },
});
