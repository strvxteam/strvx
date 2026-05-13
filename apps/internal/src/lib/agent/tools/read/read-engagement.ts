import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  engagements,
  interactions,
  nextActions,
  companies,
  contacts,
} from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  engagement_id: z.string().uuid(),
});

export const readEngagementTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "read_engagement",
  description:
    "Returns engagement state + last 10 interactions + open next_actions. Use when the message refers to or relates to a known engagement.",
  inputSchema,
  async handle(input, ctx) {
    const [engagement] = await ctx.db
      .select({
        id: engagements.id,
        name: engagements.name,
        stage: engagements.stage,
        stageEnteredAt: engagements.stageEnteredAt,
        dealValue: engagements.dealValue,
        probability: engagements.probability,
        expectedCloseDate: engagements.expectedCloseDate,
        tags: engagements.tags,
        companyId: engagements.companyId,
        primaryContactId: engagements.primaryContactId,
      })
      .from(engagements)
      .where(eq(engagements.id, input.engagement_id))
      .limit(1);
    if (!engagement) return { error: "engagement_not_found" };

    const [company] = await ctx.db
      .select({ id: companies.id, name: companies.name, industry: companies.industry })
      .from(companies)
      .where(eq(companies.id, engagement.companyId))
      .limit(1);

    let contact = null;
    if (engagement.primaryContactId) {
      const [c] = await ctx.db
        .select({ id: contacts.id, name: contacts.name, email: contacts.email, role: contacts.role })
        .from(contacts)
        .where(eq(contacts.id, engagement.primaryContactId))
        .limit(1);
      contact = c ?? null;
    }

    const recentInteractions = await ctx.db
      .select({
        id: interactions.id,
        type: interactions.type,
        content: interactions.content,
        scheduledAt: interactions.scheduledAt,
        createdAt: interactions.createdAt,
      })
      .from(interactions)
      .where(eq(interactions.engagementId, input.engagement_id))
      .orderBy(desc(interactions.createdAt))
      .limit(10);

    const openActions = await ctx.db
      .select({
        id: nextActions.id,
        description: nextActions.description,
        priority: nextActions.priority,
        dueDate: nextActions.dueDate,
      })
      .from(nextActions)
      .where(
        and(
          eq(nextActions.engagementId, input.engagement_id),
          eq(nextActions.completed, false),
          isNull(nextActions.archivedAt)
        )
      )
      .orderBy(nextActions.dueDate);

    return { engagement, company, contact, recentInteractions, openActions };
  },
};
