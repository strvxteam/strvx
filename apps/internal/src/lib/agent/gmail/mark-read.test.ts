import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "googleapis";
import type { db as DbType } from "@strvx/db";
import { markThreadRead } from "./mark-read";

const THREAD_ID = "thread-uuid-mark-read";

type UnreadRow = { id: string; gmailMessageId: string };

function makeMockDb(unreadRows: UnreadRow[] = []) {
  const updateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue({ rowCount: unreadRows.length }),
  });
  const updateImpl = vi.fn().mockReturnValue({ set: updateSet });

  const selectImpl = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(unreadRows),
    }),
  });

  return {
    select: selectImpl,
    update: updateImpl,
    _updateSet: updateSet,
  } as unknown as typeof DbType & {
    _updateSet: ReturnType<typeof vi.fn>;
  };
}

function makeGmail(opts: {
  modifyError?: Error;
  modifyErrors?: Record<number, Error>;
} = {}): gmail_v1.Gmail {
  let callIndex = 0;
  const modify = vi.fn().mockImplementation(() => {
    const idx = callIndex++;
    const perCallErr = opts.modifyErrors?.[idx];
    const err = perCallErr ?? opts.modifyError;
    if (err) return Promise.reject(err);
    return Promise.resolve({});
  });

  return {
    users: {
      messages: { modify },
    },
  } as unknown as gmail_v1.Gmail;
}

describe("markThreadRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns {markedReadCount:0, gmailErrorCount:0} when no unread messages exist", async () => {
    const db = makeMockDb([]);
    const gmail = makeGmail();

    const result = await markThreadRead({ threadId: THREAD_ID, db, gmail });

    expect(result).toEqual({ markedReadCount: 0, gmailErrorCount: 0 });
    const modify = gmail.users.messages.modify as ReturnType<typeof vi.fn>;
    expect(modify).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("calls modify once with removeLabelIds UNREAD and updates DB for a single unread message", async () => {
    const row: UnreadRow = { id: "msg-uuid-1", gmailMessageId: "gm-abc" };
    const db = makeMockDb([row]);
    const gmail = makeGmail();

    const result = await markThreadRead({ threadId: THREAD_ID, db, gmail });

    expect(result).toEqual({ markedReadCount: 1, gmailErrorCount: 0 });

    const modify = gmail.users.messages.modify as ReturnType<typeof vi.fn>;
    expect(modify).toHaveBeenCalledTimes(1);
    expect(modify).toHaveBeenCalledWith({
      userId: "me",
      id: "gm-abc",
      requestBody: { removeLabelIds: ["UNREAD"] },
    });

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db._updateSet).toHaveBeenCalledWith({ isUnread: false });
  });

  it("calls modify once per message and db.update once with all ids for multiple unread messages", async () => {
    const rows: UnreadRow[] = [
      { id: "msg-uuid-1", gmailMessageId: "gm-1" },
      { id: "msg-uuid-2", gmailMessageId: "gm-2" },
      { id: "msg-uuid-3", gmailMessageId: "gm-3" },
    ];
    const db = makeMockDb(rows);
    const gmail = makeGmail();

    const result = await markThreadRead({ threadId: THREAD_ID, db, gmail });

    expect(result).toEqual({ markedReadCount: 3, gmailErrorCount: 0 });

    const modify = gmail.users.messages.modify as ReturnType<typeof vi.fn>;
    expect(modify).toHaveBeenCalledTimes(3);
    expect(modify.mock.calls.map((c) => c[0].id)).toEqual(["gm-1", "gm-2", "gm-3"]);

    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("still updates DB for all messages and returns gmailErrorCount:1 when one modify fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const rows: UnreadRow[] = [
      { id: "msg-uuid-1", gmailMessageId: "gm-ok" },
      { id: "msg-uuid-2", gmailMessageId: "gm-fail" },
    ];
    const db = makeMockDb(rows);
    const gmail = makeGmail({
      modifyErrors: { 1: new Error("Gmail API error") },
    });

    const result = await markThreadRead({ threadId: THREAD_ID, db, gmail });

    expect(result).toEqual({ markedReadCount: 2, gmailErrorCount: 1 });

    const modify = gmail.users.messages.modify as ReturnType<typeof vi.fn>;
    expect(modify).toHaveBeenCalledTimes(2);

    expect(db.update).toHaveBeenCalledTimes(1);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[mark-read] failed for gm-fail"),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it("updates DB even when all Gmail modify calls fail", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const rows: UnreadRow[] = [
      { id: "msg-uuid-1", gmailMessageId: "gm-1" },
      { id: "msg-uuid-2", gmailMessageId: "gm-2" },
    ];
    const db = makeMockDb(rows);
    const gmail = makeGmail({ modifyError: new Error("network failure") });

    const result = await markThreadRead({ threadId: THREAD_ID, db, gmail });

    expect(result).toEqual({ markedReadCount: 2, gmailErrorCount: 2 });

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db._updateSet).toHaveBeenCalledWith({ isUnread: false });

    consoleSpy.mockRestore();
  });
});
