import { describe, it, expect, vi } from "vitest";
import type { gmail_v1 } from "googleapis";
import {
  parseHistoryResponse,
  fetchHistorySince,
  HistoryCursorExpiredError,
} from "./history";

// ---------------------------------------------------------------------------
// parseHistoryResponse
// ---------------------------------------------------------------------------

describe("parseHistoryResponse", () => {
  it("returns empty diff when response has no history records", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {};
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual([]);
    expect(diff.deleted).toEqual([]);
    expect(diff.labelChanges).toEqual([]);
    expect(diff.nextHistoryId).toBeNull();
    expect(diff.nextPageToken).toBeUndefined();
  });

  it("returns empty diff when history array is empty", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = { history: [] };
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual([]);
    expect(diff.deleted).toEqual([]);
    expect(diff.labelChanges).toEqual([]);
    expect(diff.nextHistoryId).toBeNull();
  });

  it("collects a single new message id from messagesAdded", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "1000",
          messagesAdded: [{ message: { id: "msg-abc" } }],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual(["msg-abc"]);
    expect(diff.deleted).toEqual([]);
    expect(diff.labelChanges).toEqual([]);
    expect(diff.nextHistoryId).toBe("1000");
  });

  it("collects a deleted message id from messagesDeleted", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "2000",
          messagesDeleted: [{ message: { id: "msg-del" } }],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual([]);
    expect(diff.deleted).toEqual(["msg-del"]);
    expect(diff.nextHistoryId).toBe("2000");
  });

  it("captures label-only changes with addedLabels and removedLabels", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "3000",
          labelsAdded: [
            { message: { id: "msg-lbl" }, labelIds: ["STARRED"] },
          ],
          labelsRemoved: [
            { message: { id: "msg-lbl" }, labelIds: ["UNREAD"] },
          ],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual([]);
    expect(diff.deleted).toEqual([]);
    expect(diff.labelChanges).toHaveLength(1);
    expect(diff.labelChanges[0].messageId).toBe("msg-lbl");
    expect(diff.labelChanges[0].addedLabels).toContain("STARRED");
    expect(diff.labelChanges[0].removedLabels).toContain("UNREAD");
  });

  it("handles mixed added + deleted + label changes across multiple records", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "4000",
          messagesAdded: [{ message: { id: "msg-new" } }],
        },
        {
          id: "4010",
          messagesDeleted: [{ message: { id: "msg-old" } }],
        },
        {
          id: "4020",
          labelsAdded: [
            { message: { id: "msg-lbl" }, labelIds: ["IMPORTANT"] },
          ],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual(["msg-new"]);
    expect(diff.deleted).toEqual(["msg-old"]);
    expect(diff.labelChanges).toHaveLength(1);
    expect(diff.labelChanges[0].messageId).toBe("msg-lbl");
    expect(diff.labelChanges[0].addedLabels).toContain("IMPORTANT");
    expect(diff.nextHistoryId).toBe("4020");
  });

  it("deduplicates message IDs that appear in multiple records", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "5000",
          messagesAdded: [{ message: { id: "msg-dup" } }],
        },
        {
          id: "5010",
          messagesAdded: [{ message: { id: "msg-dup" } }],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual(["msg-dup"]);
  });

  it("merges label changes for the same message across records", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "6000",
          labelsAdded: [
            { message: { id: "msg-merge" }, labelIds: ["STARRED"] },
          ],
        },
        {
          id: "6010",
          labelsAdded: [
            { message: { id: "msg-merge" }, labelIds: ["IMPORTANT"] },
          ],
          labelsRemoved: [
            { message: { id: "msg-merge" }, labelIds: ["UNREAD"] },
          ],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.labelChanges).toHaveLength(1);
    const lc = diff.labelChanges[0];
    expect(lc.messageId).toBe("msg-merge");
    expect(lc.addedLabels).toContain("STARRED");
    expect(lc.addedLabels).toContain("IMPORTANT");
    expect(lc.removedLabels).toContain("UNREAD");
  });

  it("propagates nextPageToken when present in the response", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      nextPageToken: "token-xyz",
      history: [
        {
          id: "7000",
          messagesAdded: [{ message: { id: "msg-page" } }],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.nextPageToken).toBe("token-xyz");
  });

  it("leaves nextPageToken undefined when not present", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [{ id: "8000", messagesAdded: [{ message: { id: "m1" } }] }],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.nextPageToken).toBeUndefined();
  });

  it("returns the highest historyId across all records as nextHistoryId", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        { id: "100", messagesAdded: [{ message: { id: "m1" } }] },
        { id: "9999", messagesAdded: [{ message: { id: "m2" } }] },
        { id: "500", messagesAdded: [{ message: { id: "m3" } }] },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.nextHistoryId).toBe("9999");
  });

  it("skips messagesAdded entries with no message id", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "9000",
          messagesAdded: [{ message: {} }, { message: { id: "msg-valid" } }],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.added).toEqual(["msg-valid"]);
  });

  it("skips labelsAdded entries with no message id", () => {
    const response: gmail_v1.Schema$ListHistoryResponse = {
      history: [
        {
          id: "9500",
          labelsAdded: [
            { labelIds: ["STARRED"] }, // no message
            { message: { id: "msg-ok" }, labelIds: ["STARRED"] },
          ],
        },
      ],
    };
    const diff = parseHistoryResponse(response);
    expect(diff.labelChanges).toHaveLength(1);
    expect(diff.labelChanges[0].messageId).toBe("msg-ok");
  });
});

// ---------------------------------------------------------------------------
// fetchHistorySince
// ---------------------------------------------------------------------------

describe("fetchHistorySince", () => {
  it("calls gmail.users.history.list with correct params and returns response data", async () => {
    const mockData: gmail_v1.Schema$ListHistoryResponse = {
      history: [{ id: "123", messagesAdded: [{ message: { id: "msg-1" } }] }],
    };
    const listMock = vi.fn().mockResolvedValue({ data: mockData });
    const gmail = {
      users: { history: { list: listMock } },
    } as unknown as gmail_v1.Gmail;

    const result = await fetchHistorySince(gmail, "100");

    expect(listMock).toHaveBeenCalledOnce();
    const arg = listMock.mock.calls[0][0];
    expect(arg.userId).toBe("me");
    expect(arg.startHistoryId).toBe("100");
    expect(arg.historyTypes).toEqual([
      "messageAdded",
      "messageDeleted",
      "labelAdded",
      "labelRemoved",
    ]);
    expect(arg.pageToken).toBeUndefined();
    expect(result).toEqual(mockData);
  });

  it("passes pageToken through when provided", async () => {
    const listMock = vi.fn().mockResolvedValue({ data: {} });
    const gmail = {
      users: { history: { list: listMock } },
    } as unknown as gmail_v1.Gmail;

    await fetchHistorySince(gmail, "200", "page-token-abc");

    const arg = listMock.mock.calls[0][0];
    expect(arg.pageToken).toBe("page-token-abc");
  });

  it("throws HistoryCursorExpiredError on 404 errors", async () => {
    const listMock = vi.fn().mockRejectedValue({ code: 404 });
    const gmail = {
      users: { history: { list: listMock } },
    } as unknown as gmail_v1.Gmail;

    await expect(fetchHistorySince(gmail, "old-cursor")).rejects.toThrow(
      HistoryCursorExpiredError
    );
    await expect(fetchHistorySince(gmail, "old-cursor")).rejects.toThrow(
      "Backfill required"
    );
  });

  it("re-throws non-404 errors unchanged", async () => {
    const networkError = { code: 500, message: "Internal Server Error" };
    const listMock = vi.fn().mockRejectedValue(networkError);
    const gmail = {
      users: { history: { list: listMock } },
    } as unknown as gmail_v1.Gmail;

    await expect(fetchHistorySince(gmail, "cursor")).rejects.toEqual(
      networkError
    );
  });

  it("re-throws non-object errors unchanged", async () => {
    const listMock = vi.fn().mockRejectedValue(new Error("network timeout"));
    const gmail = {
      users: { history: { list: listMock } },
    } as unknown as gmail_v1.Gmail;

    await expect(fetchHistorySince(gmail, "cursor")).rejects.toThrow(
      "network timeout"
    );
  });
});
