import { sql } from "drizzle-orm";
import { db } from "@strvx/db";

export type SearchHit = {
  threadId: string;
  subject: string | null;
  snippet: string | null;
  fromEmail: string;
  fromName: string | null;
  sentAt: Date;
  rank: number;
};

/**
 * FTS over email_messages with weighted ranking. Returns hits with the
 * threadId so the UI can group/jump. Uses plainto_tsquery to forgive
 * user typos — converts a free-form query into a valid tsquery.
 *
 * Defensive: empty query → returns empty array.
 */
export async function searchEmails(query: string, limit = 25): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const result = await db.execute<{
    thread_id: string;
    subject: string | null;
    snippet: string | null;
    from_email: string;
    from_name: string | null;
    sent_at: Date;
    rank: number;
  }>(sql`
    SELECT
      thread_id,
      subject,
      snippet,
      from_email,
      from_name,
      sent_at,
      ts_rank(search_tsv, plainto_tsquery('english', ${trimmed})) AS rank
    FROM email_messages
    WHERE search_tsv @@ plainto_tsquery('english', ${trimmed})
      AND archived_at IS NULL
    ORDER BY rank DESC, sent_at DESC
    LIMIT ${limit}
  `);

  // postgres-js driver returns rows as a plain array on db.execute; normalise
  // defensively in case the shape differs across drizzle versions.
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];

  return (rows as Array<{
    thread_id: string;
    subject: string | null;
    snippet: string | null;
    from_email: string;
    from_name: string | null;
    sent_at: Date | string;
    rank: number;
  }>).map((r) => ({
    threadId: r.thread_id,
    subject: r.subject,
    snippet: r.snippet,
    fromEmail: r.from_email,
    fromName: r.from_name,
    sentAt: typeof r.sent_at === "string" ? new Date(r.sent_at) : r.sent_at,
    rank: Number(r.rank),
  }));
}
