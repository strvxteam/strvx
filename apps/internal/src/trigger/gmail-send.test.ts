import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import { emailDrafts, emailMessages, emailThreads } from "@strvx/db";
import { runGmailSend } from "./gmail-send";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type DraftRow = {
  id: string;
  status: "pending_review" | "approved" | "sent" | "rejected";
  approvedAt: Date | null;
  mailboxId: string;
  threadId: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
};

type ThreadRow = {
  id: string;
  gmailThreadId: string | null;
};

type MessageRow = {
  messageIdHeader: string | null;
  direction: "inbound" | "outbound";
  sentAt: Date;
};

type DbState = {
  draft: DraftRow | null;
  thread: ThreadRow | null;
  messages?: MessageRow[];
};

function makeMockDb(state: DbState) {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => ({
      where: vi.fn().mockImplementation(() => {
        const out = {
          limit: vi.fn().mockImplementation(async () => {
            if (table === emailDrafts) {
              return state.draft ? [state.draft] : [];
            }
            if (table === emailThreads) {
              return state.thread ? [state.thread] : [];
            }
            return [];
          }),
          // emailMessages query uses .orderBy(...) without .limit().
          orderBy: vi.fn().mockImplementation(async () => {
            if (table === emailMessages) {
              return state.messages ?? [];
            }
            return [];
          }),
        };
        return out;
      }),
    })),
  }));

  const update = vi.fn().mockImplementation((table: unknown) => ({
    set: vi.fn().mockImplementation((v: Record<string, unknown>) => {
      updates.push({ table, values: v });
      return {
        where: vi.fn().mockResolvedValue(undefined),
      };
    }),
  }));

  return {
    select,
    update,
    _updates: updates,
  } as unknown as typeof DbType & {
    _updates: Array<{ table: unknown; values: Record<string, unknown> }>;
  };
}

const BASE_DRAFT: DraftRow = {
  id: "drf-1",
  status: "approved",
  approvedAt: new Date(Date.now() - 60 * 1000),
  mailboxId: "mb-1",
  threadId: "thr-1",
  toEmails: ["client@acme.com"],
  ccEmails: [],
  bccEmails: [],
  subject: "Confirmed: discovery",
  bodyText: "Hi — confirming.",
  bodyHtml: null,
};

const authedClientFactory = vi.fn().mockResolvedValue({
  gmail: {} as never,
  fromEmail: "team@strvx.com",
});

describe("runGmailSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when draft is not approved", async () => {
    const db = makeMockDb({
      draft: { ...BASE_DRAFT, status: "pending_review" },
      thread: { id: "thr-1", gmailThreadId: null },
    });
    const sendViaMailbox = vi.fn();
    await expect(
      runGmailSend({
        draftId: "drf-1",
        db,
        authedClientFactory,
        sendViaMailbox,
      })
    ).rejects.toThrow(/expected 'approved'/);
    expect(sendViaMailbox).not.toHaveBeenCalled();
  });

  it("rejects when approval is stale (>5min)", async () => {
    const db = makeMockDb({
      draft: {
        ...BASE_DRAFT,
        approvedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
      thread: { id: "thr-1", gmailThreadId: null },
    });
    const sendViaMailbox = vi.fn();
    await expect(
      runGmailSend({
        draftId: "drf-1",
        db,
        authedClientFactory,
        sendViaMailbox,
      })
    ).rejects.toThrow(/approval expired/);
    expect(sendViaMailbox).not.toHaveBeenCalled();
  });

  it("backfills gmail_thread_id when the thread had NULL (booking flow)", async () => {
    const db = makeMockDb({
      draft: { ...BASE_DRAFT },
      thread: { id: "thr-1", gmailThreadId: null },
    });
    const sendViaMailbox = vi.fn().mockResolvedValue({
      gmailMessageId: "gm-1",
      gmailThreadId: "gt-real-123",
    });

    const out = await runGmailSend({
      draftId: "drf-1",
      db,
      authedClientFactory,
      sendViaMailbox,
    });

    expect(out.threadIdBackfilled).toBe(true);
    expect(out.gmailThreadId).toBe("gt-real-123");

    const sendArgs = sendViaMailbox.mock.calls[0][0];
    expect(sendArgs.threadId).toBeUndefined();

    const threadUpdate = db._updates.find((u) => u.table === emailThreads);
    expect(threadUpdate).toBeDefined();
    expect(threadUpdate!.values.gmailThreadId).toBe("gt-real-123");
    expect(threadUpdate!.values.lastOutboundAt).toBeInstanceOf(Date);
    expect(threadUpdate!.values.lastMessageAt).toBeInstanceOf(Date);
  });

  it("preserves an existing gmail_thread_id (reply continuation)", async () => {
    const db = makeMockDb({
      draft: { ...BASE_DRAFT },
      thread: { id: "thr-1", gmailThreadId: "gt-existing" },
    });
    const sendViaMailbox = vi.fn().mockResolvedValue({
      gmailMessageId: "gm-2",
      gmailThreadId: "gt-existing",
    });

    const out = await runGmailSend({
      draftId: "drf-1",
      db,
      authedClientFactory,
      sendViaMailbox,
    });
    expect(out.threadIdBackfilled).toBe(false);

    const sendArgs = sendViaMailbox.mock.calls[0][0];
    expect(sendArgs.threadId).toBe("gt-existing");

    const threadUpdate = db._updates.find((u) => u.table === emailThreads);
    expect(threadUpdate!.values.gmailThreadId).toBe("gt-existing");
  });

  it("populates In-Reply-To and References from the last inbound message", async () => {
    const t0 = new Date("2026-05-10T10:00:00Z");
    const t1 = new Date("2026-05-10T11:00:00Z");
    const t2 = new Date("2026-05-10T12:00:00Z");
    const db = makeMockDb({
      draft: { ...BASE_DRAFT },
      thread: { id: "thr-1", gmailThreadId: "gt-1" },
      messages: [
        {
          messageIdHeader: "<msg-outbound-1@strvx.com>",
          direction: "outbound",
          sentAt: t0,
        },
        {
          messageIdHeader: "<msg-inbound-1@acme.com>",
          direction: "inbound",
          sentAt: t1,
        },
        {
          messageIdHeader: "<msg-inbound-2@acme.com>",
          direction: "inbound",
          sentAt: t2,
        },
      ],
    });
    const sendViaMailbox = vi.fn().mockResolvedValue({
      gmailMessageId: "gm-x",
      gmailThreadId: "gt-1",
    });
    await runGmailSend({
      draftId: "drf-1",
      db,
      authedClientFactory,
      sendViaMailbox,
    });
    const args = sendViaMailbox.mock.calls[0][0];
    expect(args.inReplyTo).toBe("<msg-inbound-2@acme.com>");
    expect(args.references).toEqual([
      "<msg-outbound-1@strvx.com>",
      "<msg-inbound-1@acme.com>",
      "<msg-inbound-2@acme.com>",
    ]);
  });

  it("omits threading headers when the thread has no inbound messages yet", async () => {
    const db = makeMockDb({
      draft: { ...BASE_DRAFT },
      thread: { id: "thr-1", gmailThreadId: null },
      messages: [
        {
          messageIdHeader: "<msg-outbound-1@strvx.com>",
          direction: "outbound",
          sentAt: new Date("2026-05-10T10:00:00Z"),
        },
      ],
    });
    const sendViaMailbox = vi.fn().mockResolvedValue({
      gmailMessageId: "gm-1",
      gmailThreadId: "gt-new",
    });
    await runGmailSend({
      draftId: "drf-1",
      db,
      authedClientFactory,
      sendViaMailbox,
    });
    const args = sendViaMailbox.mock.calls[0][0];
    expect(args.inReplyTo).toBeUndefined();
    expect(args.references).toBeUndefined();
  });

  it("builds References from a multi-message thread (oldest first)", async () => {
    const db = makeMockDb({
      draft: { ...BASE_DRAFT },
      thread: { id: "thr-1", gmailThreadId: "gt-1" },
      messages: [
        {
          messageIdHeader: "<m1@a.com>",
          direction: "inbound",
          sentAt: new Date("2026-05-01T10:00:00Z"),
        },
        {
          messageIdHeader: "<m2@strvx.com>",
          direction: "outbound",
          sentAt: new Date("2026-05-02T10:00:00Z"),
        },
        {
          messageIdHeader: "<m3@a.com>",
          direction: "inbound",
          sentAt: new Date("2026-05-03T10:00:00Z"),
        },
        // Duplicate Message-ID — should dedupe.
        {
          messageIdHeader: "<m3@a.com>",
          direction: "outbound",
          sentAt: new Date("2026-05-03T10:01:00Z"),
        },
      ],
    });
    const sendViaMailbox = vi.fn().mockResolvedValue({
      gmailMessageId: "gm-x",
      gmailThreadId: "gt-1",
    });
    await runGmailSend({
      draftId: "drf-1",
      db,
      authedClientFactory,
      sendViaMailbox,
    });
    const args = sendViaMailbox.mock.calls[0][0];
    expect(args.inReplyTo).toBe("<m3@a.com>");
    expect(args.references).toEqual([
      "<m1@a.com>",
      "<m2@strvx.com>",
      "<m3@a.com>",
    ]);
  });

  it("passes thread.gmail_thread_id as threadId for proper Gmail-side threading", async () => {
    const db = makeMockDb({
      draft: { ...BASE_DRAFT },
      thread: { id: "thr-1", gmailThreadId: "gt-existing" },
      messages: [],
    });
    const sendViaMailbox = vi.fn().mockResolvedValue({
      gmailMessageId: "gm-x",
      gmailThreadId: "gt-existing",
    });
    await runGmailSend({
      draftId: "drf-1",
      db,
      authedClientFactory,
      sendViaMailbox,
    });
    expect(sendViaMailbox.mock.calls[0][0].threadId).toBe("gt-existing");
  });

  it("marks the draft as sent and records the message id", async () => {
    const db = makeMockDb({
      draft: { ...BASE_DRAFT },
      thread: { id: "thr-1", gmailThreadId: null },
    });
    const sendViaMailbox = vi.fn().mockResolvedValue({
      gmailMessageId: "gm-final",
      gmailThreadId: "gt-final",
    });

    await runGmailSend({
      draftId: "drf-1",
      db,
      authedClientFactory,
      sendViaMailbox,
    });

    const draftUpdate = db._updates.find((u) => u.table === emailDrafts);
    expect(draftUpdate).toBeDefined();
    expect(draftUpdate!.values.status).toBe("sent");
    expect(draftUpdate!.values.sentGmailMessageId).toBe("gm-final");
  });
});
