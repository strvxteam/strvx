// Pure-ish business logic for voice-sample toggling. Kept in a separate
// module so tests can import it without dragging in Next's "use server"
// runtime, and so auth resolution can be injected.
//
// The pure ranking math for auto-suggest also lives here (rather than in
// _voice-samples-queries.ts, which is server-only) so unit tests can
// exercise it directly.

import { and, eq } from "drizzle-orm";
import { db, agentVoiceSamples, emailMessages } from "@strvx/db";

const PREVIEW_CHARS = 140;
const SUGGEST_LIMIT_DEFAULT = 5;

/** Single-tenant: anything not @strvx.com is "external". */
const INTERNAL_DOMAIN = "strvx.com";

export type VoiceSampleDeps = {
  /** Resolves the internal users.id for the caller; null = unauthorized. */
  getCallerUserId: () => Promise<string | null>;
};

/**
 * Toggle a voice-sample star for a single outbound email message. When
 * `starred=true` we upsert the row (idempotent — re-starring is a no-op
 * apart from a timestamp refresh). When `starred=false` we delete the row.
 */
export async function toggleVoiceSampleImpl(
  messageId: string,
  starred: boolean,
  deps: VoiceSampleDeps
): Promise<{ ok: true; starred: boolean }> {
  if (!messageId || typeof messageId !== "string") {
    throw new Error("messageId required");
  }
  const userId = await deps.getCallerUserId();
  if (!userId) throw new Error("Unauthorized");

  // Verify the message exists and resolve its mailboxId. Only outbound
  // messages are eligible — voice samples model what the user wrote, not
  // what was received.
  const [msg] = await db
    .select({
      id: emailMessages.id,
      mailboxId: emailMessages.mailboxId,
      direction: emailMessages.direction,
    })
    .from(emailMessages)
    .where(eq(emailMessages.id, messageId))
    .limit(1);
  if (!msg) throw new Error("Message not found");
  if (msg.direction !== "outbound") {
    throw new Error("Only outbound messages can be voice samples");
  }

  if (starred) {
    await db
      .insert(agentVoiceSamples)
      .values({
        mailboxId: msg.mailboxId,
        emailMessageId: msg.id,
        starred: true,
        addedBy: userId,
      })
      .onConflictDoUpdate({
        target: [
          agentVoiceSamples.mailboxId,
          agentVoiceSamples.emailMessageId,
        ],
        set: {
          starred: true,
          addedBy: userId,
        },
      });
    return { ok: true, starred: true };
  }

  await db
    .delete(agentVoiceSamples)
    .where(
      and(
        eq(agentVoiceSamples.mailboxId, msg.mailboxId),
        eq(agentVoiceSamples.emailMessageId, msg.id)
      )
    );
  return { ok: true, starred: false };
}

// ───────────────────────────────────────────────────────────────────────────
// Auto-suggest ranking (pure)
// ───────────────────────────────────────────────────────────────────────────

export type RankedCandidate = {
  messageId: string;
  sentAt: string;
  subject: string | null;
  toEmails: string[];
  preview: string;
  starred: boolean;
  score: number;
  humanEdited: boolean;
  hasExternalRecipient: boolean;
};

export type SuggestCandidateRow = {
  messageId: string;
  sentAt: Date;
  subject: string | null;
  toEmails: string[];
  bodyText: string | null;
  snippet: string | null;
  humanEdited: boolean | null;
};

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

/**
 * score = (length_normalized * 1.0)
 *       + (humanEdited ? 0.5 : 0)
 *       + (recipient_external ? 0.3 : 0)
 *
 * Where length_normalized = min(bodyText.length / 500, 1.0).
 */
export function scoreVoiceSampleCandidate(args: {
  bodyText: string | null;
  humanEdited: boolean;
  hasExternalRecipient: boolean;
}): number {
  const len = (args.bodyText ?? "").length;
  const lengthNormalized = Math.min(len / 500, 1.0);
  return (
    lengthNormalized +
    (args.humanEdited ? 0.5 : 0) +
    (args.hasExternalRecipient ? 0.3 : 0)
  );
}

export function hasExternalRecipient(
  toEmails: string[] | null | undefined,
  internalDomain: string = INTERNAL_DOMAIN
): boolean {
  if (!Array.isArray(toEmails) || toEmails.length === 0) return false;
  const dom = internalDomain.toLowerCase();
  return toEmails.some((addr) => {
    if (typeof addr !== "string") return false;
    const at = addr.lastIndexOf("@");
    if (at === -1) return false;
    return addr.slice(at + 1).toLowerCase() !== dom;
  });
}

/**
 * Pure ranking step: given a row set, returns the top-N candidates ordered
 * by score (ties broken by sentAt desc).
 */
export function rankSuggestCandidates(
  rows: SuggestCandidateRow[],
  limit: number = SUGGEST_LIMIT_DEFAULT
): RankedCandidate[] {
  const ranked: RankedCandidate[] = rows.map((r) => {
    const humanEdited = Boolean(r.humanEdited);
    const hasExt = hasExternalRecipient(r.toEmails);
    const score = scoreVoiceSampleCandidate({
      bodyText: r.bodyText,
      humanEdited,
      hasExternalRecipient: hasExt,
    });
    return {
      messageId: r.messageId,
      sentAt: r.sentAt.toISOString(),
      subject: r.subject,
      toEmails: r.toEmails ?? [],
      preview: buildPreview(r.bodyText, r.snippet),
      starred: false,
      score,
      humanEdited,
      hasExternalRecipient: hasExt,
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.sentAt.localeCompare(a.sentAt);
  });

  return ranked.slice(0, limit);
}
