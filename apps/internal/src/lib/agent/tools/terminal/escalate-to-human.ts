import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailThreads } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  thread_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export const escalateToHumanTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "escalate_to_human",
  description:
    "Terminate the loop and flag the thread for human attention. Use when the situation is high-stakes (large $, legal, emotional) or when you're confused and shouldn't draft.",
  inputSchema,
  isTerminal: true,
  async handle(input, ctx) {
    ctx.terminalCalled = true;
    ctx.terminalReason = input.reason;
    await ctx.db
      .update(emailThreads)
      .set({
        requiresHuman: true,
        agentState: "planned",
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, input.thread_id));
    return { terminated: "escalated", reason: input.reason };
  },
};
