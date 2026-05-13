import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailThreads } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  thread_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export const noActionTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "no_action",
  description:
    "Terminate the loop without proposing anything. Use for newsletters, FYI cc's, automated receipts.",
  inputSchema,
  isTerminal: true,
  async handle(input, ctx) {
    ctx.terminalCalled = true;
    ctx.terminalReason = input.reason;
    await ctx.db
      .update(emailThreads)
      .set({ agentState: "resolved", updatedAt: new Date() })
      .where(eq(emailThreads.id, input.thread_id));
    return { terminated: "no_action", reason: input.reason };
  },
};
