import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailDrafts, emailThreads } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  thread_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).default([]),
  bcc: z.array(z.string().email()).default([]),
  subject: z.string().min(1).max(998), // RFC 2822 line-length limit
  body: z.string().min(1).max(50000),
  reviewer_notes: z.string().max(1000).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  scheduling_proposal_id: z.string().uuid().nullable().optional(),
});

export const proposeDraftTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "propose_draft",
  description:
    "Inserts a pending_review email draft for human approval. Never sends. The human reviews via the inbox UI and clicks Send (or Edit, or Reject).",
  inputSchema,
  async handle(input, ctx) {
    // Verify thread belongs to this mailbox.
    const [thread] = await ctx.db
      .select({ id: emailThreads.id, mailboxId: emailThreads.mailboxId })
      .from(emailThreads)
      .where(eq(emailThreads.id, input.thread_id))
      .limit(1);
    if (!thread) return { error: "thread_not_found" };
    if (thread.mailboxId !== ctx.mailboxId) {
      return { error: "thread_belongs_to_other_mailbox" };
    }

    const [draft] = await ctx.db
      .insert(emailDrafts)
      .values({
        threadId: input.thread_id,
        mailboxId: ctx.mailboxId,
        cosRunId: ctx.cosRunId,
        status: "pending_review",
        toEmails: input.to,
        ccEmails: input.cc,
        bccEmails: input.bcc,
        subject: input.subject,
        bodyText: input.body,
        reviewerNotes: input.reviewer_notes,
        confidence: input.confidence,
        schedulingProposalId: input.scheduling_proposal_id ?? null,
      })
      .returning({ id: emailDrafts.id });

    // Update thread state.
    await ctx.db
      .update(emailThreads)
      .set({ agentState: "drafted", updatedAt: new Date() })
      .where(eq(emailThreads.id, input.thread_id));

    return { draft_id: draft.id, status: "pending_review" };
  },
};
