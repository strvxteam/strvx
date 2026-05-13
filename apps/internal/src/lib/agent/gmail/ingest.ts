import type { gmail_v1 } from "googleapis";
import { eq, and, sql as drizzleSql } from "drizzle-orm";
import type { db as DbType } from "@strvx/db";
import {
  mailboxWatches,
  emailThreads,
  emailMessages,
  emailAttachments,
} from "@strvx/db";
import {
  fetchHistorySince,
  parseHistoryResponse,
  HistoryCursorExpiredError,
} from "./history";
import { fetchMessage, type ParsedMessage } from "./fetch-message";

export type IngestResult = {
  newMessageIds: string[]; // our internal email_messages.id values for messages just inserted
  deletedCount: number;
  labelUpdates: number;
  newHistoryId: string | null;
};

/**
 * Ingest new Gmail history for a mailbox. Reads the current cursor from
 * mailbox_watches, fetches the diff, upserts threads + messages + attachments,
 * advances the cursor. Returns the new message ids so the caller can enqueue
 * classification.
 *
 * Idempotent on the (mailbox_id, gmail_message_id) UNIQUE index — duplicate
 * push delivery results in a no-op insert that we swallow.
 *
 * Throws HistoryCursorExpiredError when the cursor is too old (Gmail retains
 * ~7 days of history). Caller must trigger a backfill in that case.
 */
export async function ingestMailboxSince(opts: {
  mailboxId: string;
  db: typeof DbType;
  gmail: gmail_v1.Gmail;
}): Promise<IngestResult> {
  const { mailboxId, db, gmail } = opts;

  // 1. Load current cursor.
  const [watchRow] = await db
    .select({ historyId: mailboxWatches.historyId })
    .from(mailboxWatches)
    .where(eq(mailboxWatches.mailboxId, mailboxId))
    .limit(1);

  if (!watchRow) {
    throw new Error(`No mailbox_watches row for mailbox ${mailboxId}`);
  }
  const cursor = watchRow.historyId;

  // 2. Paginate through history until exhausted.
  const allAdded = new Set<string>();
  const allDeleted = new Set<string>();
  const labelMap = new Map<string, { added: Set<string>; removed: Set<string> }>();
  let nextHistoryId: string | null = cursor;
  let pageToken: string | undefined = undefined;

  do {
    const response = await fetchHistorySince(gmail, cursor, pageToken);
    const diff = parseHistoryResponse(response);
    for (const id of diff.added) allAdded.add(id);
    for (const id of diff.deleted) allDeleted.add(id);
    for (const lc of diff.labelChanges) {
      const entry = labelMap.get(lc.messageId) ?? {
        added: new Set<string>(),
        removed: new Set<string>(),
      };
      for (const l of lc.addedLabels) entry.added.add(l);
      for (const l of lc.removedLabels) entry.removed.add(l);
      labelMap.set(lc.messageId, entry);
    }
    if (diff.nextHistoryId) nextHistoryId = diff.nextHistoryId;
    pageToken = diff.nextPageToken;
  } while (pageToken);

  // 3. Fetch each new message in parallel (cap concurrency at 10).
  const addedIds = [...allAdded];
  const fetched: ParsedMessage[] = [];
  const CONCURRENCY = 10;
  for (let i = 0; i < addedIds.length; i += CONCURRENCY) {
    const batch = addedIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          return await fetchMessage(gmail, id);
        } catch (err) {
          console.error(`[ingest] Failed to fetch ${id}`, err);
          return null;
        }
      })
    );
    for (const r of results) if (r) fetched.push(r);
  }

  // 4. Upsert. One transaction per message group keeps writes bounded.
  const newMessageIds: string[] = [];

  for (const msg of fetched) {
    const inserted = await db.transaction(async (tx) => {
      // 4a. Find-or-create thread.
      const [existingThread] = await tx
        .select({ id: emailThreads.id })
        .from(emailThreads)
        .where(
          and(
            eq(emailThreads.mailboxId, mailboxId),
            eq(emailThreads.gmailThreadId, msg.gmailThreadId)
          )
        )
        .limit(1);

      let threadId: string;
      if (existingThread) {
        threadId = existingThread.id;
        // Update aggregate fields. We're conservative — only bump counters and
        // timestamps; downstream classifier denormalises category/urgency.
        await tx
          .update(emailThreads)
          .set({
            messageCount: drizzleSql`${emailThreads.messageCount} + 1`,
            lastMessageAt: msg.sentAt,
            lastInboundAt:
              msg.direction === "inbound"
                ? msg.sentAt
                : drizzleSql`${emailThreads.lastInboundAt}`,
            lastOutboundAt:
              msg.direction === "outbound"
                ? msg.sentAt
                : drizzleSql`${emailThreads.lastOutboundAt}`,
            updatedAt: new Date(),
          })
          .where(eq(emailThreads.id, threadId));
      } else {
        const participants = buildParticipantList(msg);
        const [createdThread] = await tx
          .insert(emailThreads)
          .values({
            mailboxId,
            gmailThreadId: msg.gmailThreadId,
            subject: msg.subject,
            participants,
            messageCount: 1,
            lastMessageAt: msg.sentAt,
            lastInboundAt: msg.direction === "inbound" ? msg.sentAt : null,
            lastOutboundAt: msg.direction === "outbound" ? msg.sentAt : null,
            agentState: "pending",
          })
          .returning({ id: emailThreads.id });
        threadId = createdThread.id;
      }

      // 4b. Insert message. ON CONFLICT DO NOTHING on the UNIQUE(mailbox_id, gmail_message_id).
      const [insertedMsg] = await tx
        .insert(emailMessages)
        .values({
          threadId,
          mailboxId,
          gmailMessageId: msg.gmailMessageId,
          gmailHistoryId: msg.gmailHistoryId,
          inReplyToMessageId: msg.inReplyToHeader,
          messageIdHeader: msg.messageIdHeader,
          fromEmail: msg.fromEmail,
          fromName: msg.fromName,
          toEmails: msg.toEmails,
          ccEmails: msg.ccEmails,
          bccEmails: msg.bccEmails,
          subject: msg.subject,
          bodyText: msg.bodyText,
          bodyHtml: msg.bodyHtml,
          snippet: msg.snippet,
          direction: msg.direction,
          sentAt: msg.sentAt,
          labels: msg.labels,
          isUnread: msg.isUnread,
          isStarred: msg.isStarred,
          hasAttachments: msg.hasAttachments,
          rawSize: msg.rawSize,
        })
        .onConflictDoNothing()
        .returning({ id: emailMessages.id });

      // If insert was deduped (returned no row), skip attachments.
      if (!insertedMsg) return null;

      // 4c. Insert attachments.
      if (msg.attachments.length > 0) {
        await tx.insert(emailAttachments).values(
          msg.attachments.map((a) => ({
            messageId: insertedMsg.id,
            gmailAttachmentId: a.gmailAttachmentId,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
          }))
        );
      }

      return insertedMsg.id;
    });

    if (inserted) newMessageIds.push(inserted);
  }

  // 5. Apply label updates to existing messages.
  let labelUpdates = 0;
  for (const [gmailMessageId, { added, removed }] of labelMap) {
    const [existing] = await db
      .select({ id: emailMessages.id, labels: emailMessages.labels })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.mailboxId, mailboxId),
          eq(emailMessages.gmailMessageId, gmailMessageId)
        )
      )
      .limit(1);
    if (!existing) continue;
    const merged = new Set(existing.labels);
    for (const l of added) merged.add(l);
    for (const l of removed) merged.delete(l);
    await db
      .update(emailMessages)
      .set({
        labels: [...merged],
        isUnread: merged.has("UNREAD"),
        isStarred: merged.has("STARRED"),
      })
      .where(eq(emailMessages.id, existing.id));
    labelUpdates++;
  }

  // 6. Soft-delete messages flagged by history.
  let deletedCount = 0;
  for (const gmailMessageId of allDeleted) {
    await db
      .update(emailMessages)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(emailMessages.mailboxId, mailboxId),
          eq(emailMessages.gmailMessageId, gmailMessageId)
        )
      );
    // postgres-js doesn't surface rowCount uniformly; count attempted.
    deletedCount++;
  }

  // 7. Advance cursor.
  if (nextHistoryId && nextHistoryId !== cursor) {
    await db
      .update(mailboxWatches)
      .set({ historyId: nextHistoryId, updatedAt: new Date() })
      .where(eq(mailboxWatches.mailboxId, mailboxId));
  }

  return { newMessageIds, deletedCount, labelUpdates, newHistoryId: nextHistoryId };
}

/** Build the initial participants jsonb from a single message. */
function buildParticipantList(msg: ParsedMessage) {
  const out: Array<{ email: string; name?: string; role: string }> = [];
  out.push({
    email: msg.fromEmail,
    name: msg.fromName,
    role: msg.direction === "inbound" ? "external" : "internal",
  });
  for (const t of msg.toEmails) out.push({ email: t, role: "to" });
  for (const c of msg.ccEmails) out.push({ email: c, role: "cc" });
  return out;
}

// Re-export for callers
export { HistoryCursorExpiredError };
