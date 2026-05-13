import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailMessages, emailThreads } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  thread_id: z.string().uuid(),
});

export const readThreadTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "read_thread",
  description:
    "Returns every message in the given thread with headers + body text, ordered chronologically. Use this to ground every other decision about the thread.",
  inputSchema,
  async handle(input, ctx) {
    const [thread] = await ctx.db
      .select({
        id: emailThreads.id,
        subject: emailThreads.subject,
        participants: emailThreads.participants,
        messageCount: emailThreads.messageCount,
        lastMessageAt: emailThreads.lastMessageAt,
        agentCategory: emailThreads.agentCategory,
        agentUrgency: emailThreads.agentUrgency,
        engagementId: emailThreads.engagementId,
      })
      .from(emailThreads)
      .where(eq(emailThreads.id, input.thread_id))
      .limit(1);
    if (!thread) return { error: "thread_not_found" };

    const messages = await ctx.db
      .select({
        id: emailMessages.id,
        fromEmail: emailMessages.fromEmail,
        fromName: emailMessages.fromName,
        toEmails: emailMessages.toEmails,
        ccEmails: emailMessages.ccEmails,
        subject: emailMessages.subject,
        bodyText: emailMessages.bodyText,
        snippet: emailMessages.snippet,
        direction: emailMessages.direction,
        sentAt: emailMessages.sentAt,
      })
      .from(emailMessages)
      .where(eq(emailMessages.threadId, input.thread_id))
      .orderBy(emailMessages.sentAt);

    return { thread, messages };
  },
};
