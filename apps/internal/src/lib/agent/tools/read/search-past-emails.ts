import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ToolDefinition } from "../types";

const inputSchema = z.object({
  query: z.string().min(1),
  contact_email: z.string().email().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const searchPastEmailsTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: "search_past_emails",
  description:
    "Full-text search over email_messages. Optional contact_email narrows to a specific sender. Returns snippets — use to find context for the current thread.",
  inputSchema,
  async handle(input, ctx) {
    const trimmed = input.query.trim();
    if (!trimmed) return { results: [] };

    type Row = {
      thread_id: string;
      subject: string | null;
      snippet: string | null;
      from_email: string;
      sent_at: Date | string;
    };

    const result = input.contact_email
      ? await ctx.db.execute<Row>(sql`
          SELECT
            thread_id,
            subject,
            snippet,
            from_email,
            sent_at,
            ts_rank(search_tsv, plainto_tsquery('english', ${trimmed})) AS rank
          FROM email_messages
          WHERE search_tsv @@ plainto_tsquery('english', ${trimmed})
            AND archived_at IS NULL
            AND from_email = ${input.contact_email}
          ORDER BY rank DESC, sent_at DESC
          LIMIT ${input.limit}
        `)
      : await ctx.db.execute<Row>(sql`
          SELECT
            thread_id,
            subject,
            snippet,
            from_email,
            sent_at,
            ts_rank(search_tsv, plainto_tsquery('english', ${trimmed})) AS rank
          FROM email_messages
          WHERE search_tsv @@ plainto_tsquery('english', ${trimmed})
            AND archived_at IS NULL
          ORDER BY rank DESC, sent_at DESC
          LIMIT ${input.limit}
        `);

    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];

    return {
      results: (rows as Row[]).map((r) => ({
        thread_id: r.thread_id,
        subject: r.subject,
        snippet: r.snippet,
        from_email: r.from_email,
        sent_at: typeof r.sent_at === "string" ? r.sent_at : (r.sent_at as Date).toISOString(),
      })),
    };
  },
};
