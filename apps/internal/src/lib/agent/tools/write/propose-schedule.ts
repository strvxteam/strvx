import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailThreads, schedulingProposals } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  thread_id: z.string().uuid(),
  kind: z.enum(["new_meeting", "reschedule", "cancel"]),
  duration_minutes: z.number().int().min(15).max(240),
  meeting_title: z.string().min(1).max(200),
  proposed_slots: z
    .array(
      z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      })
    )
    .min(1)
    .max(5),
  attendees: z.array(z.string().email()).min(1),
  meeting_description: z.string().max(2000).optional(),
});

type ProposeScheduleInput = z.infer<typeof inputSchema>;

export type ProposeScheduleOutput =
  | {
      scheduling_proposal_id: string;
      status: "pending";
      proposed_slots: ProposeScheduleInput["proposed_slots"];
      message: string;
    }
  | { error: string };

export const proposeScheduleTool: ToolDefinition<
  ProposeScheduleInput,
  ProposeScheduleOutput
> = {
  name: "propose_schedule",
  description:
    "Inserts a pending scheduling proposal for human approval. Slots come from find_available_slots; the human reviews and confirms one slot before any Google Calendar event is created. Never writes to Google Calendar directly.",
  inputSchema,
  async handle(input, ctx) {
    // Planner safety: tool's thread_id must match the context's threadId.
    if (input.thread_id !== ctx.threadId) {
      return { error: "thread_id_mismatch" };
    }

    const [thread] = await ctx.db
      .select({
        id: emailThreads.id,
        mailboxId: emailThreads.mailboxId,
        engagementId: emailThreads.engagementId,
      })
      .from(emailThreads)
      .where(eq(emailThreads.id, input.thread_id))
      .limit(1);

    if (!thread) return { error: "thread_not_found" };
    if (thread.mailboxId !== ctx.mailboxId) {
      return { error: "thread_belongs_to_other_mailbox" };
    }

    const [row] = await ctx.db
      .insert(schedulingProposals)
      .values({
        threadId: thread.id,
        mailboxId: ctx.mailboxId,
        engagementId: thread.engagementId,
        cosRunId: ctx.cosRunId,
        kind: input.kind,
        durationMinutes: input.duration_minutes,
        meetingTitle: input.meeting_title,
        meetingDescription: input.meeting_description,
        proposedSlots: input.proposed_slots,
        attendees: input.attendees,
        location: "Google Meet",
        status: "pending",
      })
      .returning({ id: schedulingProposals.id });

    return {
      scheduling_proposal_id: row.id,
      status: "pending",
      proposed_slots: input.proposed_slots,
      message: "Wrote scheduling proposal; awaiting human approval.",
    };
  },
};
