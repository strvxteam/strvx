import type { gmail_v1 } from "googleapis";
import { and, eq, sql as drizzleSql } from "drizzle-orm";
import type { db as DbType } from "@strvx/db";
import {
  mailboxWatches,
  emailThreads,
  emailMessages,
  emailAttachments,
} from "@strvx/db";
import { fetchMessage, type ParsedMessage } from "./fetch-message";

export type BackfillOptions = {
  mailboxId: string;
  db: typeof DbType;
  gmail: gmail_v1.Gmail;
  daysBack?: number; // default 30
  batchSize?: number; // default 100
};

export type BackfillResult = {
  messagesIngested: number;
  latestHistoryId: string | null;
};

/**
 * One-shot historical pull. Iterates messages.list pages with a date filter,
 * fetches each, upserts with threads marked agent_state='archived' so the
 * classifier doesn't pick them up.
 *
 * Idempotent on (mailbox_id, gmail_message_id) UNIQUE — safe to re-run.
 *
 * After the backfill, captures the highest historyId seen and writes it onto
 * mailbox_watches as the cursor for live ingest.
 */
export async function backfillMailbox(
  opts: BackfillOptions
): Promise<BackfillResult> {
  const { mailboxId, db, gmail, daysBack = 30, batchSize = 100 } = opts;

  const afterEpoch = Math.floor(
    (Date.now() - daysBack * 24 * 3600 * 1000) / 1000
  );
  // Gmail search query: INBOX or SENT, after a unix epoch.
  // Use `in:anywhere` to bypass auto-archive; combine with INBOX/SENT label filter.
  const query = `(label:INBOX OR label:SENT) after:${afterEpoch}`;

  const messageIds: string[] = [];
  let pageToken: string | undefined = undefined;
  let hasMore = true;
  while (hasMore) {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: batchSize,
      pageToken,
    });
    const data: gmail_v1.Schema$ListMessagesResponse = listResponse.data;
    const messages = data.messages ?? [];
    for (const m of messages) {
      if (m.id) messageIds.push(m.id);
    }
    pageToken = data.nextPageToken ?? undefined;
    hasMore = pageToken !== undefined;
  }

  if (messageIds.length === 0) {
    return { messagesIngested: 0, latestHistoryId: null };
  }

  // Fetch + upsert.
  let highestHistoryId: bigint | null = null;
  let ingested = 0;

  const CONCURRENCY = 10;
  for (let i = 0; i < messageIds.length; i += CONCURRENCY) {
    const batch = messageIds.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(
      batch.map(async (id) => {
        try {
          return await fetchMessage(gmail, id);
        } catch (err) {
          console.error(`[backfill] Failed to fetch ${id}`, err);
          return null;
        }
      })
    );

    for (const msg of fetched) {
      if (!msg) continue;

      if (msg.gmailHistoryId) {
        const idBig = BigInt(msg.gmailHistoryId);
        if (highestHistoryId === null || idBig > highestHistoryId) {
          highestHistoryId = idBig;
        }
      }

      const insertedId = await db.transaction(async (tx) => {
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
              agentState: "archived", // KEY DIFF: backfilled threads don't enter active triage
            })
            .returning({ id: emailThreads.id });
          threadId = createdThread.id;
        }

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

        if (!insertedMsg) return null;

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

      if (insertedId) ingested++;
    }
  }

  // Advance the watch cursor to the highest historyId we ingested.
  if (highestHistoryId !== null) {
    const cursor = highestHistoryId.toString();
    await db
      .update(mailboxWatches)
      .set({ historyId: cursor, updatedAt: new Date() })
      .where(eq(mailboxWatches.mailboxId, mailboxId));
    return { messagesIngested: ingested, latestHistoryId: cursor };
  }

  return { messagesIngested: ingested, latestHistoryId: null };
}

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
