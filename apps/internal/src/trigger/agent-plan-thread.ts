import { task, logger } from "./client";
import {
  planThread,
  type SeedIntent,
} from "@/lib/agent/reasoning/plan-thread";
import { reportTaskError } from "./_sentry";

export type AgentPlanThreadPayload = {
  threadId: string;
  seedIntent?: SeedIntent;
};

export const agentPlanThread = task({
  id: "agent.plan.thread",
  retry: { maxAttempts: 2 },
  queue: { name: "agent-plan", concurrencyLimit: 5 },
  run: async (payload: AgentPlanThreadPayload) => {
    try {
      logger.info("Planning thread", {
        threadId: payload.threadId,
        seedIntent: payload.seedIntent,
      });
      const result = await planThread({
        threadId: payload.threadId,
        seedIntent: payload.seedIntent,
      });
      logger.info("Plan complete", {
        threadId: payload.threadId,
        seedIntent: payload.seedIntent,
        cosRunId: result.cosRunId,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
        terminalTool: result.terminalTool,
        costUsd: result.totalCostUsd,
      });
      return result;
    } catch (err) {
      reportTaskError("agent.plan.thread", err, {
        threadId: payload.threadId,
        extras: { seedIntent: payload.seedIntent },
      });
      throw err;
    }
  },
});
