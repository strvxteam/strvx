import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "googleapis";
import type { db as DbType } from "@strvx/db";
import { ingestMailboxSince, HistoryCursorExpiredError } from "./ingest";
import type { ParsedMessage } from "./fetch-message";

// ---------------------------------------------------------------------------
// Module mocks — intercept fetchHistorySince and fetchMessage so no real I/O
// ---------------------------------------------------------------------------

vi.mock("./history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./history")>();
  return {
    ...actual,
    fetchHistorySince: vi.fn(),
  };
});

vi.mock("./fetch-message", () => ({
  fetchMessage: vi.fn(),
}));

import { fetchHistorySince } from "./history";
import { fetchMessage } from "./fetch-message";

const mockFetchHistorySince = vi.mocked(fetchHistorySince);
const mockFetchMessage = vi.mocked(fetchMessage);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAILBOX_ID = "mailbox-uuid-1";
// Must be a numeric string — parseHistoryResponse calls BigInt() on history record ids
const CURSOR = "100";

function makeMsg(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    gmailMessageId: "gm-1",
    gmailHistoryId: "hist-200",
    gmailThreadId: "gt-1",
    messageIdHeader: "<msg-1@example.com>",
    inReplyToHeader: undefined,
    referencesHeader: undefined,
    fromEmail: "sender@external.com",
    fromName: "Sender",
    toEmails: ["me@strvx.com"],
    ccEmails: [],
    bccEmails: [],
    subject: "Hello",
    bodyText: "Hello world",
    bodyHtml: "<p>Hello world</p>",
    snippet: "Hello world",
    direction: "inbound",
    sentAt: new Date("2024-01-15T10:00:00Z"),
    labels: ["INBOX", "UNREAD"],
    isUnread: true,
    isStarred: false,
    hasAttachments: false,
    rawSize: 1024,
    attachments: [],
    ...overrides,
  };
}

type TxFn = (tx: unknown) => Promise<unknown>;

/**
 * Build a minimal mock Drizzle db. Call tracking lives on `._calls`.
 *
 * `transactionOverride` lets individual tests supply a fully custom tx
 * implementation. When omitted a sensible default is used (no existing thread,
 * returns the configured insertedThread / insertedMsg rows).
 */
function makeMockDb(opts: {
  watchRow?: { historyId: string } | null;
  existingThread?: { id: string } | null;
  insertedThread?: { id: string } | null;
  insertedMsg?: { id: string } | null;
  existingMsg?: { id: string; labels: string[] } | null;
  transactionOverride?: (fn: TxFn) => Promise<unknown>;
} = {}) {
  const {
    watchRow = { historyId: CURSOR },
    existingThread = null,
    insertedThread = { id: "thread-uuid-1" },
    insertedMsg = { id: "msg-uuid-1" },
    existingMsg = null,
    transactionOverride,
  } = opts;

  const calls = {
    selectCalls: [] as unknown[],
    updateCalls: [] as unknown[],
    transactionFns: [] as TxFn[],
  };

  // outer db.select:
  //   call 0 -> mailboxWatches lookup
  //   call 1+ -> emailMessages label-update lookup
  let selectCallIndex = 0;
  const selectImpl = vi.fn().mockImplementation((_cols: unknown) => {
    const idx = selectCallIndex++;
    calls.selectCalls.push(_cols);
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (idx === 0) return Promise.resolve(watchRow ? [watchRow] : []);
            return Promise.resolve(existingMsg ? [existingMsg] : []);
          }),
        }),
      }),
    };
  });

  // outer db.update (label updates + cursor advance)
  const updateImpl = vi.fn().mockImplementation((_table: unknown) => {
    calls.updateCalls.push(_table);
    return {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    };
  });

  // default transaction: thread-lookup -> insert thread -> insert msg
  const defaultTx = vi.fn().mockImplementation(async (fn: TxFn) => {
    calls.transactionFns.push(fn);
    let txSelIdx = 0;
    const txSelect = vi.fn().mockImplementation(() => {
      const i = txSelIdx++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() =>
              Promise.resolve(i === 0 && existingThread ? [existingThread] : [])
            ),
          }),
        }),
      };
    });
    const txInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(insertedMsg ? [insertedMsg] : []),
        }),
        returning: vi.fn().mockResolvedValue(insertedThread ? [insertedThread] : []),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
      }),
    });
    const txUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
    });
    return fn({ select: txSelect, insert: txInsert, update: txUpdate });
  });

  const transactionImpl = transactionOverride
    ? vi.fn().mockImplementation(async (fn: TxFn) => {
        calls.transactionFns.push(fn);
        return transactionOverride(fn);
      })
    : defaultTx;

  return {
    select: selectImpl,
    update: updateImpl,
    transaction: transactionImpl,
    _calls: calls,
  } as unknown as typeof DbType & { _calls: typeof calls };
}

function makeHistoryResponse(
  messageIds: string[],
  opts: { nextPageToken?: string; historyId?: string } = {}
): gmail_v1.Schema$ListHistoryResponse {
  const { nextPageToken, historyId = "200" } = opts;
  return {
    history: messageIds.length > 0
      ? [{ id: historyId, messagesAdded: messageIds.map((id) => ({ message: { id } })) }]
      : [],
    nextPageToken,
  };
}

/** A history record with no messages — just advances the cursor. */
function makeEmptyHistoryResponse(historyId = "200"): gmail_v1.Schema$ListHistoryResponse {
  return { history: [{ id: historyId }] };
}

function makeGmail(): gmail_v1.Gmail {
  return {} as gmail_v1.Gmail;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestMailboxSince", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty newMessageIds when history has no added messages", async () => {
    mockFetchHistorySince.mockResolvedValueOnce(makeEmptyHistoryResponse("200"));

    const db = makeMockDb();
    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toEqual([]);
    expect(result.deletedCount).toBe(0);
    expect(result.labelUpdates).toBe(0);
    expect(mockFetchHistorySince).toHaveBeenCalledOnce();
    expect(mockFetchMessage).not.toHaveBeenCalled();
  });

  it("throws a clear error when no mailbox_watches row exists", async () => {
    const db = makeMockDb({ watchRow: null });
    await expect(
      ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() })
    ).rejects.toThrow(`No mailbox_watches row for mailbox ${MAILBOX_ID}`);

    expect(mockFetchHistorySince).not.toHaveBeenCalled();
  });

  it("re-throws HistoryCursorExpiredError when fetchHistorySince 404s", async () => {
    mockFetchHistorySince.mockRejectedValueOnce(new HistoryCursorExpiredError());

    const db = makeMockDb();
    await expect(
      ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() })
    ).rejects.toBeInstanceOf(HistoryCursorExpiredError);
  });

  it("creates a thread and inserts message for a new inbound message", async () => {
    const msg = makeMsg({ direction: "inbound" });
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse([msg.gmailMessageId], { historyId: "300" })
    );
    mockFetchMessage.mockResolvedValueOnce(msg);

    const db = makeMockDb({
      existingThread: null,
      insertedThread: { id: "thread-uuid-1" },
      insertedMsg: { id: "msg-uuid-1" },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toEqual(["msg-uuid-1"]);
    expect(mockFetchMessage).toHaveBeenCalledWith(expect.anything(), msg.gmailMessageId);
    expect(db._calls.transactionFns).toHaveLength(1);
  });

  it("sets lastOutboundAt and null lastInboundAt on new thread for outbound message", async () => {
    const msg = makeMsg({
      direction: "outbound",
      gmailMessageId: "gm-out-1",
      gmailThreadId: "gt-out-1",
      labels: ["SENT"],
      isUnread: false,
    });
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse([msg.gmailMessageId], { historyId: "301" })
    );
    mockFetchMessage.mockResolvedValueOnce(msg);

    let capturedThreadInsertValues: Record<string, unknown> | null = null;

    const db = makeMockDb({
      transactionOverride: async (fn) => {
        let insertNum = 0;
        const txSelect = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          }),
        });
        const txInsert = vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((vals: unknown) => {
            insertNum++;
            if (insertNum === 1) capturedThreadInsertValues = vals as Record<string, unknown>;
            return {
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "msg-uuid-out-1" }]),
              }),
              returning: vi.fn().mockResolvedValue([{ id: "thread-uuid-out-1" }]),
              then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
            };
          }),
        }));
        const txUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
        });
        return fn({ select: txSelect, insert: txInsert, update: txUpdate });
      },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toContain("msg-uuid-out-1");
    expect(capturedThreadInsertValues).not.toBeNull();
    expect(capturedThreadInsertValues!.lastOutboundAt).toBeInstanceOf(Date);
    expect(capturedThreadInsertValues!.lastInboundAt).toBeNull();
  });

  it("excludes deduped message from newMessageIds and does not insert attachments", async () => {
    const msg = makeMsg({ gmailMessageId: "gm-dup" });
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse(["gm-dup"], { historyId: "400" })
    );
    mockFetchMessage.mockResolvedValueOnce(msg);

    let attachmentInsertCalled = false;

    const db = makeMockDb({
      transactionOverride: async (fn) => {
        const txSelect = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "existing-thread-1" }]),
            }),
          }),
        });
        const txInsert = vi.fn().mockImplementation(() => ({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
            returning: vi.fn().mockResolvedValue([{ id: "thread-1" }]),
            then: (resolve: (v: unknown) => unknown) => {
              attachmentInsertCalled = true;
              return Promise.resolve([]).then(resolve);
            },
          }),
        }));
        const txUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
        });
        return fn({ select: txSelect, insert: txInsert, update: txUpdate });
      },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toEqual([]);
    expect(attachmentInsertCalled).toBe(false);
  });

  it("updates messageCount and lastMessageAt on existing thread without creating a new one", async () => {
    const msg = makeMsg({ direction: "inbound" });
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse([msg.gmailMessageId], { historyId: "500" })
    );
    mockFetchMessage.mockResolvedValueOnce(msg);

    let threadUpdateValues: Record<string, unknown> | null = null;

    const db = makeMockDb({
      transactionOverride: async (fn) => {
        const txSelect = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "existing-thread-42" }]),
            }),
          }),
        });
        const txInsert = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "msg-uuid-42" }]),
            }),
            returning: vi.fn().mockResolvedValue([{ id: "new-thread" }]),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
          }),
        });
        const txUpdate = vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((vals: unknown) => {
            threadUpdateValues = vals as Record<string, unknown>;
            return { where: vi.fn().mockResolvedValue({ rowCount: 1 }) };
          }),
        }));
        return fn({ select: txSelect, insert: txInsert, update: txUpdate });
      },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toContain("msg-uuid-42");
    expect(threadUpdateValues).not.toBeNull();
    expect(Object.keys(threadUpdateValues!)).toContain("messageCount");
    expect(Object.keys(threadUpdateValues!)).toContain("lastMessageAt");
  });

  it("applies label updates to existing messages without inserting new messages", async () => {
    mockFetchHistorySince.mockResolvedValueOnce({
      history: [
        {
          id: "600",
          labelsAdded: [{ message: { id: "gm-lbl-1" }, labelIds: ["STARRED"] }],
          labelsRemoved: [{ message: { id: "gm-lbl-1" }, labelIds: ["UNREAD"] }],
        },
      ],
    });

    const db = makeMockDb({
      existingMsg: { id: "msg-db-lbl-1", labels: ["INBOX", "UNREAD"] },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toEqual([]);
    expect(result.labelUpdates).toBe(1);
    expect(mockFetchMessage).not.toHaveBeenCalled();
  });

  it("counts soft-deletes for messages flagged in history deletions", async () => {
    mockFetchHistorySince.mockResolvedValueOnce({
      history: [
        {
          id: "700",
          messagesDeleted: [
            { message: { id: "gm-del-1" } },
            { message: { id: "gm-del-2" } },
          ],
        },
      ],
    });

    const db = makeMockDb();
    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.deletedCount).toBe(2);
    expect(result.newMessageIds).toEqual([]);
    expect(mockFetchMessage).not.toHaveBeenCalled();
    expect(db._calls.updateCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("calls fetchHistorySince multiple times when nextPageToken is present", async () => {
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse(["gm-pg1"], { historyId: "800", nextPageToken: "token-page-2" })
    );
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse(["gm-pg2"], { historyId: "810" })
    );

    const msg1 = makeMsg({ gmailMessageId: "gm-pg1", gmailThreadId: "gt-pg1" });
    const msg2 = makeMsg({ gmailMessageId: "gm-pg2", gmailThreadId: "gt-pg2" });
    mockFetchMessage.mockResolvedValueOnce(msg1);
    mockFetchMessage.mockResolvedValueOnce(msg2);

    let txCall = 0;
    const db = makeMockDb({
      transactionOverride: async (fn) => {
        txCall++;
        const msgId = txCall === 1 ? "msg-uuid-pg1" : "msg-uuid-pg2";
        const threadId = txCall === 1 ? "thread-pg1" : "thread-pg2";
        const txSelect = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          }),
        });
        const txInsert = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: msgId }]),
            }),
            returning: vi.fn().mockResolvedValue([{ id: threadId }]),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
          }),
        });
        const txUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
        });
        return fn({ select: txSelect, insert: txInsert, update: txUpdate });
      },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(mockFetchHistorySince).toHaveBeenCalledTimes(2);
    expect(mockFetchHistorySince.mock.calls[0][2]).toBeUndefined();
    expect(mockFetchHistorySince.mock.calls[1][2]).toBe("token-page-2");
    expect(result.newMessageIds).toHaveLength(2);
    expect(result.newMessageIds).toContain("msg-uuid-pg1");
    expect(result.newMessageIds).toContain("msg-uuid-pg2");
  });

  it("inserts attachments when the message has them", async () => {
    const msg = makeMsg({
      gmailMessageId: "gm-att-1",
      hasAttachments: true,
      attachments: [
        {
          gmailAttachmentId: "att-id-1",
          filename: "invoice.pdf",
          mimeType: "application/pdf",
          sizeBytes: 50000,
        },
      ],
    });
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse([msg.gmailMessageId], { historyId: "900" })
    );
    mockFetchMessage.mockResolvedValueOnce(msg);

    let insertCallCount = 0;

    const db = makeMockDb({
      transactionOverride: async (fn) => {
        const txSelect = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          }),
        });
        const txInsert = vi.fn().mockImplementation(() => {
          insertCallCount++;
          const call = insertCallCount;
          return {
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue(
                  call === 2 ? [{ id: "msg-att-uuid-1" }] : []
                ),
              }),
              returning: vi.fn().mockResolvedValue([{ id: "thread-att-uuid-1" }]),
              then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
            }),
          };
        });
        const txUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
        });
        return fn({ select: txSelect, insert: txInsert, update: txUpdate });
      },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toContain("msg-att-uuid-1");
    expect(insertCallCount).toBe(3);
  });

  it("advances the cursor in mailbox_watches when nextHistoryId differs from current", async () => {
    mockFetchHistorySince.mockResolvedValueOnce(makeEmptyHistoryResponse("999"));

    const db = makeMockDb();
    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newHistoryId).toBe("999");
    expect(db._calls.updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("does not advance the cursor when nextHistoryId equals current cursor", async () => {
    mockFetchHistorySince.mockResolvedValueOnce({ history: [{ id: CURSOR }] });

    const db = makeMockDb({ watchRow: { historyId: CURSOR } });
    await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(db._calls.updateCalls).toHaveLength(0);
  });

  it("skips messages that fail to fetch and continues inserting others", async () => {
    mockFetchHistorySince.mockResolvedValueOnce(
      makeHistoryResponse(["gm-fail", "gm-ok"], { historyId: "1000" })
    );
    mockFetchMessage
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(makeMsg({ gmailMessageId: "gm-ok", gmailThreadId: "gt-ok" }));

    const db = makeMockDb({
      transactionOverride: async (fn) => {
        const txSelect = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          }),
        });
        const txInsert = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "msg-ok-uuid" }]),
            }),
            returning: vi.fn().mockResolvedValue([{ id: "thread-ok-uuid" }]),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
          }),
        });
        const txUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
        });
        return fn({ select: txSelect, insert: txInsert, update: txUpdate });
      },
    });

    const result = await ingestMailboxSince({ mailboxId: MAILBOX_ID, db, gmail: makeGmail() });

    expect(result.newMessageIds).toEqual(["msg-ok-uuid"]);
  });
});
