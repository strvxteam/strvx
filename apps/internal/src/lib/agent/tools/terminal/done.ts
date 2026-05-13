import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailThreads } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  thread_id: z.string().uuid(),
  summary: z.string().min(1).max(500),
});

export const doneTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "done",
  description:
    "Terminate the loop cleanly. Call this when the thread has been planned — a draft proposed, an interaction logged, etc.",
  inputSchema,
  isTerminal: true,
  async handle(input, ctx) {
    ctx.terminalCalled = true;
    ctx.terminalReason = input.summary;
    await ctx.db
      .update(emailThreads)
      .set({ agentState: "planned", updatedAt: new Date() })
      .where(eq(emailThreads.id, input.thread_id));
    return { terminated: "done", summary: input.summary };
  },
};
