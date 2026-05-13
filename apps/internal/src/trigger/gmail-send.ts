import { google, type gmail_v1 } from "googleapis";
import { asc, eq, sql } from "drizzle-orm";
import { task, logger } from "./client";
import {
  db as defaultDb,
  emailDrafts,
  emailMessages,
  emailThreads,
} from "@strvx/db";
import { getAuthedMailboxClientSafe } from "@/lib/agent/mailbox-oauth";
import {
  sendViaMailbox as defaultSendViaMailbox,
  type SendResult,
} from "@/lib/agent/gmail/send";
import { reportTaskError } from "./_sentry";

export type RunGmailSendArgs = {
  draftId: string;
  db?: typeof defaultDb;
  /** Build a Gmail client + know the From email for a mailbox. */
  authedClientFactory?: (
    mailboxId: string
  ) => Promise<{ gmail: gmail_v1.Gmail; fromEmail: string }>;
  /** Override the actual Gmail.send for tests. */
  sendViaMailbox?: typeof defaultSendViaMailbox;
  /** Pinnable clock for tests. */
  now?: () => Date;
};

export type RunGmailSendResult = SendResult & {
  /** Whether we wrote the real gmail_thread_id back onto a NULL thread. */
  threadIdBackfilled: boolean;
};

const defaultAuthedClientFactory = async (mailboxId: string) => {
  const safe = await getAuthedMailboxClientSafe(mailboxId);
  if (!safe.ok) {
    const err = new Error(
      `gmail.send: mailbox.${safe.error}: ${safe.message}`
    ) as Error & { code?: string };
    err.code = safe.error;
    throw err;
  }
  return {
    gmail: google.gmail({ version: "v1", auth: safe.client }),
    fromEmail: safe.email,
  };
};

/**
 * Pure orchestration core for sending an approved draft. Extracted from
 * the Trigger.dev task so it's unit-testable with injected db / Gmail
 * stubs.
 *
 * Backfills `email_threads.gmail_thread_id` when the linked thread was
 * created without one (e.g. agent-authored booking-confirmation drafts
 * pre-Gmail-message — see migration 015).
 */
export async function runGmailSend(
  args: RunGmailSendArgs
): Promise<RunGmailSendResult> {
  const db = args.db ?? defaultDb;
  const authedClientFactory =
    args.authedClientFactory ?? defaultAuthedClientFactory;
  const sendViaMailbox = args.sendViaMailbox ?? defaultSendViaMailbox;
  const now = args.now ?? (() => new Date());

  const [draft] = await db
    .select()
    .from(emailDrafts)
    .where(eq(emailDrafts.id, args.draftId))
    .limit(1);

  if (!draft) {
    throw new Error(`Draft ${args.draftId} not found`);
  }
  if (draft.status !== "approved") {
    throw new Error(
      `Draft ${args.draftId} status is ${draft.status}, expected 'approved'`
    );
  }
  if (!draft.approvedAt) {
    throw new Error(`Draft ${args.draftId} missing approvedAt`);
  }
  const ageMs = now().getTime() - new Date(draft.approvedAt).getTime();
  if (ageMs > 5 * 60 * 1000) {
    throw new Error(
      `Draft ${args.draftId} approval expired (${Math.floor(ageMs / 1000)}s old)`
    );
  }

  const { gmail, fromEmail } = await authedClientFactory(draft.mailboxId);

  // Load the linked thread so we can:
  //   - thread the new message under an existing gmail_thread_id when
  //     one already exists (real reply continuation)
  //   - backfill gmail_thread_id afterward when the thread was
  //     pre-created with NULL (e.g. booking-confirmation drafts)
  const [thread] = await db
    .select({
      id: emailThreads.id,
      gmailThreadId: emailThreads.gmailThreadId,
    })
    .from(emailThreads)
    .where(eq(emailThreads.id, draft.threadId))
    .limit(1);

  // RFC 5322 threading: when replying to an existing thread, set
  // In-Reply-To to the most recent inbound message's Message-ID, and
  // build References from every prior messageIdHeader in the thread
  // (oldest first). The recipient's mail client uses these to keep the
  // reply attached to the same conversation. We can't include prior
  // `References` because we don't persist that header today — but
  // listing every Message-ID we have is RFC-compliant and sufficient
  // for Gmail/Outlook/Apple Mail threading.
  const threadHeaders = await loadRfc5322Headers(db, draft.threadId);

  const result = await sendViaMailbox({
    gmail,
    threadId: thread?.gmailThreadId ?? undefined,
    fromEmail,
    to: draft.toEmails,
    cc: draft.ccEmails,
    bcc: draft.bccEmails,
    subject: draft.subject,
    bodyText: draft.bodyText,
    bodyHtml: draft.bodyHtml ?? undefined,
    inReplyTo: threadHeaders.inReplyTo,
    references: threadHeaders.references,
  });

  const sentAt = now();
  const threadNeedsBackfill = !!thread && thread.gmailThreadId === null;

  await db
    .update(emailDrafts)
    .set({
      status: "sent",
      sentAt,
      sentGmailMessageId: result.gmailMessageId,
      updatedAt: sentAt,
    })
    .where(eq(emailDrafts.id, draft.id));

  if (thread) {
    // Backfill thread metadata: only set gmail_thread_id when it
    // wasn't already populated (avoids stomping the real id on a
    // pre-existing reply continuation).
    await db
      .update(emailThreads)
      .set({
        gmailThreadId: thread.gmailThreadId ?? result.gmailThreadId,
        lastOutboundAt: sentAt,
        lastMessageAt: sentAt,
        messageCount: sql`${emailThreads.messageCount} + 1`,
        updatedAt: sentAt,
      })
      .where(eq(emailThreads.id, thread.id));
  }

  return {
    gmailMessageId: result.gmailMessageId,
    gmailThreadId: result.gmailThreadId,
    threadIdBackfilled: threadNeedsBackfill,
  };
}

/**
 * Build RFC 5322 In-Reply-To + References from the persisted thread.
 *
 * Strategy:
 *   - In-Reply-To = the most recent inbound message's Message-ID header
 *   - References  = every prior messageIdHeader we have for the thread,
 *                   oldest first, terminating in the In-Reply-To value.
 *
 * Returns `{ inReplyTo: undefined, references: undefined }` when no
 * prior inbound message exists (a brand-new outbound thread — e.g. a
 * booking confirmation that hasn't received any reply yet).
 *
 * Exported for tests.
 */
export async function loadRfc5322Headers(
  db: typeof defaultDb,
  threadId: string
): Promise<{ inReplyTo?: string; references?: string[] }> {
  const rows = await db
    .select({
      messageIdHeader: emailMessages.messageIdHeader,
      direction: emailMessages.direction,
      sentAt: emailMessages.sentAt,
    })
    .from(emailMessages)
    .where(eq(emailMessages.threadId, threadId))
    .orderBy(asc(emailMessages.sentAt));

  // Find the last inbound message's messageIdHeader for In-Reply-To.
  let inReplyTo: string | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.direction === "inbound" && r.messageIdHeader) {
      inReplyTo = r.messageIdHeader;
      break;
    }
  }

  if (!inReplyTo) {
    // No inbound message yet — this is a brand-new outbound conversation.
    return { inReplyTo: undefined, references: undefined };
  }

  // Build References from every prior messageIdHeader we have, oldest
  // first, deduped while preserving order. Ensures inReplyTo is the
  // last entry (RFC 5322).
  const references: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.messageIdHeader || seen.has(r.messageIdHeader)) continue;
    seen.add(r.messageIdHeader);
    references.push(r.messageIdHeader);
  }
  if (!seen.has(inReplyTo)) references.push(inReplyTo);

  return { inReplyTo, references };
}

/**
 * Send a previously-approved email draft.
 *
 * Validates that the draft is approved and the approval is fresh (< 5min).
 * Backfills gmail_thread_id on the linked thread when it was pre-created
 * without one (booking-confirmation flow).
 */
export const gmailSend = task({
  id: "gmail.send",
  retry: { maxAttempts: 3 },
  run: async (payload: { draftId: string }) => {
    try {
      const result = await runGmailSend({ draftId: payload.draftId });
      logger.info("Draft sent", {
        draftId: payload.draftId,
        gmailMessageId: result.gmailMessageId,
        gmailThreadId: result.gmailThreadId,
        threadIdBackfilled: result.threadIdBackfilled,
      });
      return {
        gmailMessageId: result.gmailMessageId,
        gmailThreadId: result.gmailThreadId,
      };
    } catch (err) {
      reportTaskError("gmail.send", err, {
        extras: { draftId: payload.draftId },
      });
      throw err;
    }
  },
});
