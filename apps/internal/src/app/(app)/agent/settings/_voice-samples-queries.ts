import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  db,
  agentVoiceSamples,
  emailDrafts,
  emailMessages,
} from "@strvx/db";
import {
  rankSuggestCandidates,
  type RankedCandidate,
  type SuggestCandidateRow,
} from "./_voice-samples-impl";

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const PREVIEW_CHARS = 140;
const SAMPLES_PER_MAILBOX = 30;
const SUGGEST_LIMIT_DEFAULT = 5;
const SUGGEST_FETCH_LIMIT = 50;

export type VoiceSampleCandidate = {
  messageId: string;
  sentAt: string;
  subject: string | null;
  toEmails: string[];
  preview: string;
  starred: boolean;
};

/**
 * Pull recent outbound messages for a mailbox and left-join the
 * agent_voice_samples table to know which are already curated.
 * Returns the most recent 30 outbound messages from the last 30 days.
 */
export async function fetchVoiceSampleCandidates(
  mailboxId: string,
  now: Date = new Date()
): Promise<VoiceSampleCandidate[]> {
  const cutoff = new Date(now.getTime() - DAYS_30_MS);

  const rows = await db
    .select({
      messageId: emailMessages.id,
      sentAt: emailMessages.sentAt,
      subject: emailMessages.subject,
      toEmails: emailMessages.toEmails,
      bodyText: emailMessages.bodyText,
      snippet: emailMessages.snippet,
      starred: sql<boolean>`(${agentVoiceSamples.id} IS NOT NULL)`,
    })
    .from(emailMessages)
    .leftJoin(
      agentVoiceSamples,
      and(
        eq(agentVoiceSamples.emailMessageId, emailMessages.id),
        eq(agentVoiceSamples.mailboxId, mailboxId)
      )
    )
    .where(
      and(
        eq(emailMessages.mailboxId, mailboxId),
        eq(emailMessages.direction, "outbound"),
        gte(emailMessages.sentAt, cutoff)
      )
    )
    .orderBy(desc(emailMessages.sentAt))
    .limit(SAMPLES_PER_MAILBOX);

  return rows.map((r) => ({
    messageId: r.messageId,
    sentAt: r.sentAt.toISOString(),
    subject: r.subject,
    toEmails: r.toEmails ?? [],
    preview: buildPreview(r.bodyText, r.snippet),
    starred: Boolean(r.starred),
  }));
}

function buildPreview(
  bodyText: string | null,
  snippet: string | null
): string {
  const source = (bodyText ?? snippet ?? "").trim();
  if (!source) return "";
  const collapsed = source.replace(/\s+/g, " ");
  return collapsed.length > PREVIEW_CHARS
    ? collapsed.slice(0, PREVIEW_CHARS).trimEnd() + "…"
    : collapsed;
}

// ───────────────────────────────────────────────────────────────────────────
// Auto-suggest (top-N highest-scoring outbound messages not yet starred)
// ───────────────────────────────────────────────────────────────────────────

export type RankedVoiceSampleCandidate = RankedCandidate;

/**
 * Suggest up to `limit` outbound messages from the last 30 days for a
 * mailbox that are NOT already starred as a voice sample. Joins through
 * email_drafts (via sent_gmail_message_id) to learn whether the message
 * was human-edited before send. Returns rows sorted by score desc.
 *
 * The `dbInstance` parameter is injectable so callers in tests can pass
 * a mock; in production we pass the singleton `db` exported by `@strvx/db`.
 */
export async function suggestVoiceSampleCandidates(
  dbInstance: typeof db,
  mailboxId: string,
  limit: number = SUGGEST_LIMIT_DEFAULT,
  now: Date = new Date()
): Promise<RankedVoiceSampleCandidate[]> {
  const cutoff = new Date(now.getTime() - DAYS_30_MS);

  const rows = await dbInstance
    .select({
      messageId: emailMessages.id,
      sentAt: emailMessages.sentAt,
      subject: emailMessages.subject,
      toEmails: emailMessages.toEmails,
      bodyText: emailMessages.bodyText,
      snippet: emailMessages.snippet,
      humanEdited: emailDrafts.humanEdited,
    })
    .from(emailMessages)
    .leftJoin(
      agentVoiceSamples,
      and(
        eq(agentVoiceSamples.emailMessageId, emailMessages.id),
        eq(agentVoiceSamples.mailboxId, mailboxId)
      )
    )
    .leftJoin(
      emailDrafts,
      and(
        eq(emailDrafts.sentGmailMessageId, emailMessages.gmailMessageId),
        eq(emailDrafts.mailboxId, mailboxId)
      )
    )
    .where(
      and(
        eq(emailMessages.mailboxId, mailboxId),
        eq(emailMessages.direction, "outbound"),
        gte(emailMessages.sentAt, cutoff),
        // Exclude already-starred messages.
        isNull(agentVoiceSamples.id)
      )
    )
    .orderBy(desc(emailMessages.sentAt))
    .limit(SUGGEST_FETCH_LIMIT);

  return rankSuggestCandidates(rows as SuggestCandidateRow[], limit);
}
