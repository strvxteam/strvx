import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailThreads } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  thread_id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
});

export const linkThreadToEngagementTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "link_thread_to_engagement",
  description:
    "Link this email thread to a CRM engagement. Useful for grouping outbound replies and analytics. Reversible metadata change — no human approval needed.",
  inputSchema,
  async handle(input, ctx) {
    await ctx.db
      .update(emailThreads)
      .set({
        engagementId: input.engagement_id,
        contactId: input.contact_id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, input.thread_id));
    return { linked: true };
  },
};
