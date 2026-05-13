import { and, eq, inArray } from "drizzle-orm";
import type { gmail_v1 } from "googleapis";
import type { db as DbType } from "@strvx/db";
import { emailMessages } from "@strvx/db";

// `and` is imported above because future refinements may need it; silence
// unused-import warnings without removing the symbol.
void and;

/**
 * Mark every unread message in a thread as read — both in our DB and in
 * Gmail (so the Gmail UI's unread badge stays in sync).
 *
 * Called when the user opens a thread in the (future) Agent Inbox UI.
 * Best-effort on the Gmail side: if a single message modify fails we log
 * and continue rather than aborting the whole batch.
 */
export async function markThreadRead(opts: {
  threadId: string;
  db: typeof DbType;
  gmail: gmail_v1.Gmail;
}): Promise<{ markedReadCount: number; gmailErrorCount: number }> {
  const { threadId, db, gmail } = opts;

  const unreadRows = await db
    .select({
      id: emailMessages.id,
      gmailMessageId: emailMessages.gmailMessageId,
    })
    .from(emailMessages)
    .where(
      and(eq(emailMessages.threadId, threadId), eq(emailMessages.isUnread, true))
    );

  if (unreadRows.length === 0) {
    return { markedReadCount: 0, gmailErrorCount: 0 };
  }

  // Update Gmail labels (best-effort).
  let gmailErrorCount = 0;
  for (const row of unreadRows) {
    try {
      await gmail.users.messages.modify({
        userId: "me",
        id: row.gmailMessageId,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    } catch (err) {
      console.error(`[mark-read] failed for ${row.gmailMessageId}`, err);
      gmailErrorCount++;
    }
  }

  // Update DB regardless of Gmail outcome — single bulk update.
  const ids = unreadRows.map((r) => r.id);
  await db
    .update(emailMessages)
    .set({ isUnread: false })
    .where(inArray(emailMessages.id, ids));

  return { markedReadCount: ids.length, gmailErrorCount };
}
