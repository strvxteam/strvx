import { z } from "zod";

/**
 * Output schema for the cos.classify.message GPT-5-mini call.
 * The model returns one row per inbound message capturing category + intent
 * + workflow hint + a one-line rationale. Strict structured output guarantees
 * shape; the agent_classifications table stores it.
 */
export const classificationSchema = z.object({
  category: z.enum([
    "lead_inquiry",
    "client_active",
    "client_followup",
    "vendor",
    "personal",
    "newsletter",
    "spam",
    "calendar_invite",
    "scheduling_request",
    "other",
  ]),
  urgency: z.enum(["urgent", "normal", "low"]),
  intent: z.enum([
    "reply_needed",
    "schedule",
    "reschedule",
    "cancel",
    "fyi",
    "introduction",
    "proposal_review",
    "invoice_question",
    "other",
  ]),
  requires_reply: z.boolean(),
  suggested_workflow: z.enum([
    "none",
    "draft_reply",
    "propose_schedule",
    "escalate",
  ]),
  related_engagement_id: z.string().uuid().nullable(),
  related_engagement_confidence: z
    .enum(["high", "medium", "low"])
    .nullable(),
  related_contact_id: z.string().uuid().nullable(),
  reasoning: z.string().min(1).max(200),
});

export type Classification = z.infer<typeof classificationSchema>;

/**
 * JSON Schema produced for OpenAI structured output using Zod 4's native
 * toJSONSchema(). Emits JSON Schema draft-2020-12; strict mode enforced at
 * the OpenAI call site.
 */
export const classificationJsonSchema = classificationSchema.toJSONSchema();
