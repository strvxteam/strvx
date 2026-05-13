import { sql } from "drizzle-orm";
import { z } from "zod";
import { nextActions } from "@strvx/db";
import type { ToolDefinition } from "../types";

// Matches the `priority` enum in the DB: "urgent" | "high" | "normal" | "low"
const inputSchema = z.object({
  engagement_id: z.string().uuid(),
  description: z.string().min(1).max(500),
  due_date: z.string().date().optional(), // YYYY-MM-DD
  priority: z.enum(["urgent", "high", "normal", "low"]).default("normal"),
});

export const createNextActionTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "create_next_action",
  description:
    "Create a TODO item against the engagement. Use only when the email explicitly creates a future task (e.g. 'send the contract by Friday'). Auto-flagged with created_by_agent=true.",
  inputSchema,
  async handle(input, ctx) {
    const rows = await ctx.db.execute<{ id: string }>(
      sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`
    );
    const systemUsers = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
    const systemUser = systemUsers[0] as { id: string } | undefined;
    if (!systemUser) return { error: "no_system_user" };

    const [row] = await ctx.db
      .insert(nextActions)
      .values({
        engagementId: input.engagement_id,
        ownerId: systemUser.id,
        description: input.description,
        priority: input.priority,
        dueDate: input.due_date,
        createdByAgent: true,
      })
      .returning({ id: nextActions.id });

    return { next_action_id: row.id };
  },
};
