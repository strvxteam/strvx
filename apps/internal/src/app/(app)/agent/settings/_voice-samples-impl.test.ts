import { describe, it, expect, vi, beforeEach } from "vitest";

type SelectStep = { rows: unknown[] };

const dbState: {
  selects: SelectStep[];
  selectIdx: number;
  insertCalls: Array<{ values: Record<string, unknown>; usedConflict: boolean }>;
  deleteCalls: number;
} = {
  selects: [],
  selectIdx: 0,
  insertCalls: [],
  deleteCalls: 0,
};

function resetDbState(selects: SelectStep[]) {
  dbState.selects = selects;
  dbState.selectIdx = 0;
  dbState.insertCalls = [];
  dbState.deleteCalls = 0;
}

vi.mock("@strvx/db", async () => {
  const actual = await vi.importActual<typeof import("@strvx/db")>("@strvx/db");
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => {
          const step = dbState.selects[dbState.selectIdx++];
          return Promise.resolve(step ? step.rows : []);
        }),
      }),
    }),
  }));

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
      const record = { values: v, usedConflict: false };
      dbState.insertCalls.push(record);
      return {
        onConflictDoUpdate: vi.fn().mockImplementation(() => {
          record.usedConflict = true;
          return Promise.resolve({ rowCount: 1 });
        }),
      };
    }),
  }));

  const deleteFn = vi.fn().mockImplementation(() => ({
    where: vi.fn().mockImplementation(() => {
      dbState.deleteCalls++;
      return Promise.resolve({ rowCount: 1 });
    }),
  }));

  return {
    ...actual,
    db: { select, insert, delete: deleteFn },
  };
});

import { toggleVoiceSampleImpl } from "./_voice-samples-impl";

const USER_ID = "user-uuid-1";
const MESSAGE_ID = "msg-uuid-1";
const MAILBOX_ID = "mb-uuid-1";

describe("toggleVoiceSampleImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when getCallerUserId returns null", async () => {
    resetDbState([]);
    await expect(
      toggleVoiceSampleImpl(MESSAGE_ID, true, {
        getCallerUserId: async () => null,
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  it("throws when messageId is missing", async () => {
    resetDbState([]);
    await expect(
      toggleVoiceSampleImpl("", true, {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/messageId required/);
  });

  it("throws when message is not found", async () => {
    resetDbState([{ rows: [] }]);
    await expect(
      toggleVoiceSampleImpl(MESSAGE_ID, true, {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/Message not found/);
  });

  it("rejects starring an inbound message", async () => {
    resetDbState([
      {
        rows: [
          { id: MESSAGE_ID, mailboxId: MAILBOX_ID, direction: "inbound" },
        ],
      },
    ]);
    await expect(
      toggleVoiceSampleImpl(MESSAGE_ID, true, {
        getCallerUserId: async () => USER_ID,
      })
    ).rejects.toThrow(/outbound/);
  });

  it("upserts a row via onConflictDoUpdate when starring an outbound message", async () => {
    resetDbState([
      {
        rows: [
          { id: MESSAGE_ID, mailboxId: MAILBOX_ID, direction: "outbound" },
        ],
      },
    ]);
    const out = await toggleVoiceSampleImpl(MESSAGE_ID, true, {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true, starred: true });
    expect(dbState.insertCalls.length).toBe(1);
    expect(dbState.insertCalls[0].usedConflict).toBe(true);
    expect(dbState.insertCalls[0].values.mailboxId).toBe(MAILBOX_ID);
    expect(dbState.insertCalls[0].values.emailMessageId).toBe(MESSAGE_ID);
    expect(dbState.insertCalls[0].values.starred).toBe(true);
    expect(dbState.insertCalls[0].values.addedBy).toBe(USER_ID);
  });

  it("is idempotent — re-starring goes through the same conflict path", async () => {
    // First call
    resetDbState([
      {
        rows: [
          { id: MESSAGE_ID, mailboxId: MAILBOX_ID, direction: "outbound" },
        ],
      },
    ]);
    await toggleVoiceSampleImpl(MESSAGE_ID, true, {
      getCallerUserId: async () => USER_ID,
    });
    expect(dbState.insertCalls.length).toBe(1);

    // Second call — same message, no error.
    resetDbState([
      {
        rows: [
          { id: MESSAGE_ID, mailboxId: MAILBOX_ID, direction: "outbound" },
        ],
      },
    ]);
    const out = await toggleVoiceSampleImpl(MESSAGE_ID, true, {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true, starred: true });
    expect(dbState.insertCalls.length).toBe(1); // fresh state, second toggle
    expect(dbState.insertCalls[0].usedConflict).toBe(true);
  });

  it("deletes the row when un-starring", async () => {
    resetDbState([
      {
        rows: [
          { id: MESSAGE_ID, mailboxId: MAILBOX_ID, direction: "outbound" },
        ],
      },
    ]);
    const out = await toggleVoiceSampleImpl(MESSAGE_ID, false, {
      getCallerUserId: async () => USER_ID,
    });
    expect(out).toEqual({ ok: true, starred: false });
    expect(dbState.deleteCalls).toBe(1);
    expect(dbState.insertCalls.length).toBe(0);
  });

  it("un-starring on an outbound message that wasn't starred still resolves ok (delete is a no-op)", async () => {
    resetDbState([
      {
        rows: [
          { id: MESSAGE_ID, mailboxId: MAILBOX_ID, direction: "outbound" },
        ],
      },
    ]);
    const out = await toggleVoiceSampleImpl(MESSAGE_ID, false, {
      getCallerUserId: async () => USER_ID,
    });
    expect(out.ok).toBe(true);
    expect(dbState.deleteCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// scoreVoiceSampleCandidate + rankSuggestCandidates (pure ranking math)
// ---------------------------------------------------------------------------

import {
  rankSuggestCandidates,
  scoreVoiceSampleCandidate,
} from "./_voice-samples-impl";

describe("scoreVoiceSampleCandidate", () => {
  it("returns 0 for empty body, no flags", () => {
    expect(
      scoreVoiceSampleCandidate({
        bodyText: "",
        humanEdited: false,
        hasExternalRecipient: false,
      })
    ).toBe(0);
  });

  it("clamps length normalization at 1.0 for >=500 chars", () => {
    expect(
      scoreVoiceSampleCandidate({
        bodyText: "x".repeat(500),
        humanEdited: false,
        hasExternalRecipient: false,
      })
    ).toBe(1.0);
    expect(
      scoreVoiceSampleCandidate({
        bodyText: "x".repeat(1500),
        humanEdited: false,
        hasExternalRecipient: false,
      })
    ).toBe(1.0);
  });

  it("scales length linearly below the 500-char cap", () => {
    expect(
      scoreVoiceSampleCandidate({
        bodyText: "x".repeat(250),
        humanEdited: false,
        hasExternalRecipient: false,
      })
    ).toBe(0.5);
  });

  it("adds +0.5 for humanEdited, +0.3 for external recipient", () => {
    expect(
      scoreVoiceSampleCandidate({
        bodyText: "",
        humanEdited: true,
        hasExternalRecipient: false,
      })
    ).toBe(0.5);
    expect(
      scoreVoiceSampleCandidate({
        bodyText: "",
        humanEdited: false,
        hasExternalRecipient: true,
      })
    ).toBe(0.3);
    expect(
      scoreVoiceSampleCandidate({
        bodyText: "x".repeat(500),
        humanEdited: true,
        hasExternalRecipient: true,
      })
    ).toBeCloseTo(1.0 + 0.5 + 0.3, 5);
  });
});

describe("rankSuggestCandidates", () => {
  function row(opts: {
    id: string;
    sentAt: string;
    body: string;
    humanEdited?: boolean;
    toEmails?: string[];
  }) {
    return {
      messageId: opts.id,
      sentAt: new Date(opts.sentAt),
      subject: `subj-${opts.id}`,
      toEmails: opts.toEmails ?? [],
      bodyText: opts.body,
      snippet: null,
      humanEdited: opts.humanEdited ?? false,
    };
  }

  it("orders by score desc, breaks ties by sentAt desc", () => {
    const rows = [
      // score 1.0 + 0.5 + 0.3 = 1.8 (highest)
      row({
        id: "a",
        sentAt: "2026-05-01T00:00:00Z",
        body: "x".repeat(500),
        humanEdited: true,
        toEmails: ["client@example.com"],
      }),
      // score 1.0 + 0 + 0 = 1.0
      row({
        id: "b",
        sentAt: "2026-05-02T00:00:00Z",
        body: "x".repeat(500),
        toEmails: ["alice@strvx.com"], // internal — no +0.3
      }),
      // score 1.0 + 0 + 0 = 1.0 (tie with b — newer wins)
      row({
        id: "c",
        sentAt: "2026-05-03T00:00:00Z",
        body: "x".repeat(500),
        toEmails: [],
      }),
    ];
    const out = rankSuggestCandidates(rows, 5);
    expect(out.map((r) => r.messageId)).toEqual(["a", "c", "b"]);
    expect(out[0].score).toBeCloseTo(1.8, 5);
    expect(out[0].humanEdited).toBe(true);
    expect(out[0].hasExternalRecipient).toBe(true);
  });

  it("limits output to the requested count", () => {
    const rows = Array.from({ length: 10 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return row({
        id: `m${i}`,
        sentAt: `2026-05-${day}T00:00:00Z`,
        body: "x".repeat(100 + i * 50),
      });
    });
    const out = rankSuggestCandidates(rows, 3);
    expect(out).toHaveLength(3);
  });

  it("treats short bodies fairly (normalized < 1.0)", () => {
    const out = rankSuggestCandidates(
      [
        row({ id: "short", sentAt: "2026-05-01T00:00:00Z", body: "hi" }),
        row({
          id: "long",
          sentAt: "2026-05-01T00:00:00Z",
          body: "x".repeat(500),
        }),
      ],
      5
    );
    expect(out[0].messageId).toBe("long");
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("flags external recipients only when domain differs from strvx.com", () => {
    const out = rankSuggestCandidates(
      [
        row({
          id: "ext",
          sentAt: "2026-05-01T00:00:00Z",
          body: "hi",
          toEmails: ["someone@example.com"],
        }),
        row({
          id: "int",
          sentAt: "2026-05-01T00:00:00Z",
          body: "hi",
          toEmails: ["alice@strvx.com"],
        }),
      ],
      5
    );
    const ext = out.find((r) => r.messageId === "ext");
    const int = out.find((r) => r.messageId === "int");
    expect(ext?.hasExternalRecipient).toBe(true);
    expect(int?.hasExternalRecipient).toBe(false);
  });

  it("does not surface starred messages (caller filters them out at the SQL layer; output starred is always false)", () => {
    const out = rankSuggestCandidates(
      [row({ id: "a", sentAt: "2026-05-01T00:00:00Z", body: "hi" })],
      5
    );
    expect(out[0].starred).toBe(false);
  });
});
