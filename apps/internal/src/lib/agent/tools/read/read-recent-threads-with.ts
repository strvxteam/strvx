import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  contact_email: z.string().email(),
  limit: z.number().int().min(1).max(20).default(5),
});

export const readRecentThreadsWithTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "read_recent_threads_with",
  description:
    "Last N threads involving the given contact (any direction). Returns subject + last message timestamp + a one-line snippet from the latest message.",
  inputSchema,
  async handle(input, ctx) {
    type Row = {
      id: string;
      subject: string | null;
      last_message_at: Date | string;
      snippet: string | null;
    };

    const result = await ctx.db.execute<Row>(sql`
      SELECT DISTINCT
        t.id,
        t.subject,
        t.last_message_at,
        (SELECT snippet FROM email_messages m2
          WHERE m2.thread_id = t.id
          ORDER BY m2.sent_at DESC LIMIT 1) AS snippet
      FROM email_threads t
      JOIN email_messages m ON m.thread_id = t.id
      WHERE m.mailbox_id = ${ctx.mailboxId}
        AND (
          m.from_email = ${input.contact_email}
          OR ${input.contact_email} = ANY(m.to_emails)
          OR ${input.contact_email} = ANY(m.cc_emails)
        )
      ORDER BY t.last_message_at DESC
      LIMIT ${input.limit}
    `);

    const items = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];

    return {
      threads: (items as Row[]).map((r) => ({
        id: r.id,
        subject: r.subject,
        last_message_at:
          typeof r.last_message_at === "string"
            ? r.last_message_at
            : (r.last_message_at as Date).toISOString(),
        snippet: r.snippet,
      })),
    };
  },
};
