import type { gmail_v1 } from "googleapis";

export type HistoryLabelChange = {
  messageId: string;
  addedLabels: string[];
  removedLabels: string[];
};

export type HistoryDiff = {
  added: string[]; // unique gmail message IDs from messagesAdded
  deleted: string[]; // unique gmail message IDs from messagesDeleted
  labelChanges: HistoryLabelChange[];
  nextHistoryId: string | null; // max historyId seen, for cursor advance
  nextPageToken?: string;
};

/**
 * Parses a gmail.users.history.list response into a deduplicated diff
 * the ingest pipeline can act on. Pure function — no API calls, no DB.
 *
 * Per Gmail history semantics:
 *   - messagesAdded → INSERT messages
 *   - messagesDeleted → soft-delete messages
 *   - labelsAdded / labelsRemoved → update labels[] on email_messages
 *
 * Dedup: if a message ID appears multiple times across records (e.g.
 * added then re-labeled), only the latest semantic operation matters.
 * For Phase 1 we keep this simple: collect all unique IDs per bucket;
 * the ingest layer is idempotent on the UNIQUE(mailbox_id, gmail_message_id)
 * constraint anyway.
 */
export function parseHistoryResponse(
  response: gmail_v1.Schema$ListHistoryResponse
): HistoryDiff {
  const added = new Set<string>();
  const deleted = new Set<string>();
  const labelChangesByMsg = new Map<
    string,
    { added: Set<string>; removed: Set<string> }
  >();
  let maxHistoryId: bigint | null = null;

  const records = response.history ?? [];
  for (const record of records) {
    if (record.id) {
      const idBig = BigInt(record.id);
      if (maxHistoryId === null || idBig > maxHistoryId) maxHistoryId = idBig;
    }
    for (const m of record.messagesAdded ?? []) {
      if (m.message?.id) added.add(m.message.id);
    }
    for (const m of record.messagesDeleted ?? []) {
      if (m.message?.id) deleted.add(m.message.id);
    }
    for (const lc of record.labelsAdded ?? []) {
      const id = lc.message?.id;
      if (!id) continue;
      const entry = labelChangesByMsg.get(id) ?? {
        added: new Set(),
        removed: new Set(),
      };
      for (const l of lc.labelIds ?? []) entry.added.add(l);
      labelChangesByMsg.set(id, entry);
    }
    for (const lc of record.labelsRemoved ?? []) {
      const id = lc.message?.id;
      if (!id) continue;
      const entry = labelChangesByMsg.get(id) ?? {
        added: new Set(),
        removed: new Set(),
      };
      for (const l of lc.labelIds ?? []) entry.removed.add(l);
      labelChangesByMsg.set(id, entry);
    }
  }

  const labelChanges: HistoryLabelChange[] = [];
  for (const [messageId, { added: a, removed: r }] of labelChangesByMsg) {
    labelChanges.push({
      messageId,
      addedLabels: [...a],
      removedLabels: [...r],
    });
  }

  return {
    added: [...added],
    deleted: [...deleted],
    labelChanges,
    nextHistoryId: maxHistoryId !== null ? maxHistoryId.toString() : null,
    nextPageToken: response.nextPageToken ?? undefined,
  };
}

/**
 * Thin wrapper over gmail.users.history.list. Caller passes the constructed
 * gmail client and the cursor; we request all relevant history types in one go.
 *
 * On 404 (history cursor expired — Gmail retains ~7 days), throws
 * HistoryCursorExpiredError so the ingest layer can fall back to backfill.
 */
export class HistoryCursorExpiredError extends Error {
  constructor(public mailboxId?: string) {
    super("Gmail history cursor expired (404). Backfill required.");
    this.name = "HistoryCursorExpiredError";
  }
}

export async function fetchHistorySince(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
  pageToken?: string
): Promise<gmail_v1.Schema$ListHistoryResponse> {
  try {
    const response = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: [
        "messageAdded",
        "messageDeleted",
        "labelAdded",
        "labelRemoved",
      ],
      pageToken,
    });
    return response.data;
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: number }).code === 404
    ) {
      throw new HistoryCursorExpiredError();
    }
    throw err;
  }
}
