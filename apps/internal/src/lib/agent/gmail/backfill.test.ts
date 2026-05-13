import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "googleapis";
import type { db as DbType } from "@strvx/db";
import { backfillMailbox } from "./backfill";
import type { ParsedMessage } from "./fetch-message";

vi.mock("./fetch-message", () => ({
  fetchMessage: vi.fn(),
}));

import { fetchMessage } from "./fetch-message";

const mockFetchMessage = vi.mocked(fetchMessage);

const MAILBOX_ID = "mailbox-uuid-backfill";

function makeMsg(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    gmailMessageId: "gm-1",
    gmailHistoryId: "500",
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

function makeMockDb(
  opts: {
    existingThread?: { id: string } | null;
    insertedThread?: { id: string } | null;
    insertedMsg?: { id: string } | null;
    transactionOverride?: (fn: TxFn) => Promise<unknown>;
  } = {}
) {
  const {
    existingThread = null,
    insertedThread = { id: "thread-uuid-1" },
    insertedMsg = { id: "msg-uuid-1" },
    transactionOverride,
  } = opts;

  const calls = {
    updateCalls: [] as unknown[],
    transactionFns: [] as TxFn[],
  };

  const updateImpl = vi.fn().mockImplementation((_table: unknown) => {
    calls.updateCalls.push(_table);
    return {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    };
  });

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
        then: (cb: (v: unknown) => unknown) => Promise.resolve([]).then(cb),
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
    update: updateImpl,
    transaction: transactionImpl,
    _calls: calls,
  } as unknown as typeof DbType & { _calls: typeof calls };
}

function makeGmail(
  listPages: Array<{
    messages?: Array<{ id: string }>;
    nextPageToken?: string;
  }> = [{ messages: [] }]
): gmail_v1.Gmail {
  let callIndex = 0;
  return {
    users: {
      messages: {
        list: vi.fn().mockImplementation(() => {
          const page = listPages[callIndex] ?? { messages: [] };
          callIndex++;
          return Promise.resolve({ data: page });
        }),
      },
    },
  } as unknown as gmail_v1.Gmail;
}

function makeTxOverride(opts: {
  existingThreadId?: string | null;
  insertedMsgId?: string;
  insertedThreadId?: string;
  captureThreadInsert?: (vals: unknown) => void;
  insertCallCount?: { value: number };
  skipMsgInsert?: boolean;
}) {
  return async (fn: TxFn) => {
    const {
      existingThreadId = null,
      insertedMsgId = "msg-uuid-1",
      insertedThreadId = "thread-uuid-1",
      captureThreadInsert,
      insertCallCount,
      skipMsgInsert = false,
    } = opts;

    const txSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(
            existingThreadId ? [{ id: existingThreadId }] : []
          ),
        }),
      }),
    });

    let localInsertCallCount = 0;
    const txInsert = vi.fn().mockImplementation(() => {
      localInsertCallCount++;
      const currentCall = localInsertCallCount;
      if (insertCallCount) insertCallCount.value = currentCall;

      let capturedVals: unknown = null;
      return {
        values: vi.fn().mockImplementation((vals: unknown) => {
          capturedVals = vals;
          if (captureThreadInsert && currentCall === 1) captureThreadInsert(vals);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(
                skipMsgInsert ? [] : [{ id: insertedMsgId }]
              ),
            }),
            returning: vi.fn().mockResolvedValue([{ id: insertedThreadId }]),
            then: (cb: (v: unknown) => unknown) => Promise.resolve(capturedVals).then(cb),
          };
        }),
      };
    });

    const txUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }),
    });

    return fn({ select: txSelect, insert: txInsert, update: txUpdate });
  };
}

describe("backfillMailbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns messagesIngested=0 and null latestHistoryId when messages.list is empty", async () => {
    const gmail = makeGmail([{ messages: [] }]);
    const db = makeMockDb();

    const result = await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail });

    expect(result.messagesIngested).toBe(0);
    expect(result.latestHistoryId).toBeNull();
    expect(mockFetchMessage).not.toHaveBeenCalled();
    expect(db._calls.transactionFns).toHaveLength(0);
    expect(db._calls.updateCalls).toHaveLength(0);
  });

  it("creates thread with agentState='archived' and inserts message for a new inbound message", async () => {
    const msg = makeMsg({ direction: "inbound", gmailHistoryId: "999" });
    const gmail = makeGmail([{ messages: [{ id: msg.gmailMessageId }] }]);
    mockFetchMessage.mockResolvedValueOnce(msg);

    let capturedThreadVals: Record<string, unknown> | null = null;

    const db = makeMockDb({
      transactionOverride: makeTxOverride({
        captureThreadInsert: (vals) => {
          capturedThreadVals = vals as Record<string, unknown>;
        },
        insertedMsgId: "msg-uuid-new",
        insertedThreadId: "thread-uuid-new",
      }),
    });

    const result = await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail });

    expect(result.messagesIngested).toBe(1);
    expect(result.latestHistoryId).toBe("999");
    expect(capturedThreadVals).not.toBeNull();
    expect(capturedThreadVals!.agentState).toBe("archived");
    expect(db._calls.updateCalls).toHaveLength(1);
  });

  it("iterates all pages when messages.list returns nextPageToken", async () => {
    const msg1 = makeMsg({ gmailMessageId: "gm-pg1", gmailThreadId: "gt-pg1", gmailHistoryId: "100" });
    const msg2 = makeMsg({ gmailMessageId: "gm-pg2", gmailThreadId: "gt-pg2", gmailHistoryId: "200" });

    const gmail = makeGmail([
      { messages: [{ id: "gm-pg1" }], nextPageToken: "token-page-2" },
      { messages: [{ id: "gm-pg2" }] },
    ]);
    mockFetchMessage.mockResolvedValueOnce(msg1).mockResolvedValueOnce(msg2);

    let txCall = 0;
    const db = makeMockDb({
      transactionOverride: async (fn) => {
        txCall++;
        const msgId = txCall === 1 ? "msg-uuid-pg1" : "msg-uuid-pg2";
        const threadId = txCall === 1 ? "thread-pg1" : "thread-pg2";
        return makeTxOverride({
          insertedMsgId: msgId,
          insertedThreadId: threadId,
        })(fn);
      },
    });

    const result = await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail });

    const listMock = gmail.users.messages.list as ReturnType<typeof vi.fn>;
    expect(listMock.mock.calls).toHaveLength(2);
    expect(listMock.mock.calls[0][0].pageToken).toBeUndefined();
    expect(listMock.mock.calls[1][0].pageToken).toBe("token-page-2");

    expect(result.messagesIngested).toBe(2);
    expect(result.latestHistoryId).toBe("200");
  });

  it("does not count messages where onConflictDoNothing returns no row", async () => {
    const msg = makeMsg({ gmailMessageId: "gm-dup", gmailHistoryId: "300" });
    const gmail = makeGmail([{ messages: [{ id: "gm-dup" }] }]);
    mockFetchMessage.mockResolvedValueOnce(msg);

    const db = makeMockDb({
      transactionOverride: makeTxOverride({
        existingThreadId: "existing-thread-1",
        skipMsgInsert: true,
      }),
    });

    const result = await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail });

    expect(result.messagesIngested).toBe(0);
    expect(result.latestHistoryId).toBe("300");
  });

  it("builds query with after:<epoch_30d_ago> when using default daysBack", async () => {
    const gmail = makeGmail([{ messages: [] }]);
    const db = makeMockDb();

    const beforeCall = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
    await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail });
    const afterCall = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);

    const listMock = gmail.users.messages.list as ReturnType<typeof vi.fn>;
    const qParam: string = listMock.mock.calls[0][0].q;

    const pattern = /after:(\d+)/;
    const match = pattern.exec(qParam);
    expect(match).not.toBeNull();
    const epochInQuery = Number(match![1]);

    expect(epochInQuery).toBeGreaterThanOrEqual(beforeCall - 2);
    expect(epochInQuery).toBeLessThanOrEqual(afterCall + 2);
  });

  it("builds query with after:<epoch_14d_ago> when daysBack=14", async () => {
    const gmail = makeGmail([{ messages: [] }]);
    const db = makeMockDb();

    const beforeCall = Math.floor((Date.now() - 14 * 24 * 3600 * 1000) / 1000);
    await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail, daysBack: 14 });
    const afterCall = Math.floor((Date.now() - 14 * 24 * 3600 * 1000) / 1000);

    const listMock = gmail.users.messages.list as ReturnType<typeof vi.fn>;
    const qParam: string = listMock.mock.calls[0][0].q;

    const pattern = /after:(\d+)/;
    const match = pattern.exec(qParam);
    expect(match).not.toBeNull();
    const epochInQuery = Number(match![1]);

    expect(epochInQuery).toBeGreaterThanOrEqual(beforeCall - 2);
    expect(epochInQuery).toBeLessThanOrEqual(afterCall + 2);
  });

  it("uses the highest historyId across all messages to advance mailbox_watches cursor", async () => {
    const msgLow = makeMsg({ gmailMessageId: "gm-low", gmailThreadId: "gt-low", gmailHistoryId: "100" });
    const msgHigh = makeMsg({ gmailMessageId: "gm-high", gmailThreadId: "gt-high", gmailHistoryId: "999" });
    const msgMid = makeMsg({ gmailMessageId: "gm-mid", gmailThreadId: "gt-mid", gmailHistoryId: "500" });

    const gmail = makeGmail([
      { messages: [{ id: "gm-low" }, { id: "gm-high" }, { id: "gm-mid" }] },
    ]);
    mockFetchMessage
      .mockResolvedValueOnce(msgLow)
      .mockResolvedValueOnce(msgHigh)
      .mockResolvedValueOnce(msgMid);

    let txCall = 0;
    const db = makeMockDb({
      transactionOverride: async (fn) => {
        txCall++;
        return makeTxOverride({
          insertedMsgId: `msg-uuid-${txCall}`,
          insertedThreadId: `thread-uuid-${txCall}`,
        })(fn);
      },
    });

    const result = await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail });

    expect(result.messagesIngested).toBe(3);
    expect(result.latestHistoryId).toBe("999");
    expect(db._calls.updateCalls).toHaveLength(1);
  });

  it("logs error and skips failed fetchMessage calls while ingesting other messages", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const msgOk = makeMsg({
      gmailMessageId: "gm-ok",
      gmailThreadId: "gt-ok",
      gmailHistoryId: "800",
    });

    const gmail = makeGmail([{ messages: [{ id: "gm-fail" }, { id: "gm-ok" }] }]);
    mockFetchMessage
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(msgOk);

    const db = makeMockDb({
      transactionOverride: makeTxOverride({ insertedMsgId: "msg-ok-uuid" }),
    });

    const result = await backfillMailbox({ mailboxId: MAILBOX_ID, db, gmail });

    expect(result.messagesIngested).toBe(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[backfill] Failed to fetch gm-fail"),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
