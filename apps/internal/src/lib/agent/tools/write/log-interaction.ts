import { sql } from "drizzle-orm";
import { z } from "zod";
import { interactions } from "@strvx/db";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  engagement_id: z.string().uuid(),
  type: z.enum(["note", "email_received", "email_sent"]),
  content: z.string().min(1).max(2000),
  email_message_id: z.string().uuid().optional(),
});

export const logInteractionTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "log_interaction",
  description:
    "Append a row to the engagement's interaction timeline. Only allowed types: note, email_received, email_sent. Stage changes are never auto-logged.",
  inputSchema,
  async handle(input, ctx) {
    // Look up the system user (first user by created_at) to attribute the interaction.
    // Kept as a raw SQL call to avoid importing the users table here — keeps tools
    // loosely coupled and easier to test with a stub.
    const rows = await ctx.db.execute<{ id: string }>(
      sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`
    );
    const systemUsers = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
    const systemUser = systemUsers[0] as { id: string } | undefined;
    if (!systemUser) return { error: "no_system_user" };

    const [row] = await ctx.db
      .insert(interactions)
      .values({
        engagementId: input.engagement_id,
        authorId: systemUser.id,
        type: input.type,
        content: input.content,
        emailMessageId: input.email_message_id,
      })
      .returning({ id: interactions.id });

    return { interaction_id: row.id };
  },
};
