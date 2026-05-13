import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import { classifyMessage, makeStrict, estimateCostUsd } from "./classify";
import type { Classification } from "./schema";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../openai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../openai-client")>();
  return {
    ...actual,
    getOpenAI: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MSG_ID = "msg-uuid-aaa";
const THREAD_ID = "thread-uuid-bbb";
const MAILBOX_ID = "mailbox-uuid-ccc";
const RUN_ID = "run-uuid-ddd";
const CLASS_ID = "class-uuid-eee";

const VALID_CLASSIFICATION: Classification = {
  category: "lead_inquiry",
  urgency: "normal",
  intent: "reply_needed",
  requires_reply: true,
  suggested_workflow: "draft_reply",
  related_engagement_id: null,
  related_engagement_confidence: null,
  related_contact_id: null,
  reasoning: "first-touch lead asking about pricing",
};

const MSG_ROW = {
  id: MSG_ID,
  threadId: THREAD_ID,
  mailboxId: MAILBOX_ID,
  gmailMessageId: "gm-001",
  gmailHistoryId: "hist-100",
  inReplyToMessageId: null,
  messageIdHeader: "<msg001@example.com>",
  fromEmail: "alice@example.com",
  fromName: "Alice",
  toEmails: ["me@strvx.com"],
  ccEmails: [],
  bccEmails: [],
  subject: "Interested in your services",
  bodyText: "Hi, I saw your website and wanted to learn more.",
  bodyHtml: null,
  snippet: "Hi, I saw your website",
  direction: "inbound" as const,
  sentAt: new Date("2024-06-01T10:00:00Z"),
  labels: ["INBOX", "UNREAD"],
  isUnread: true,
  isStarred: false,
  hasAttachments: false,
  rawSize: 512,
  archivedAt: null,
  createdAt: new Date("2024-06-01T10:00:00Z"),
};

const THREAD_ROW = {
  id: THREAD_ID,
  subject: "Interested in your services",
  messageCount: 1,
  participants: [{ email: "alice@example.com", name: "Alice" }],
  mailboxId: MAILBOX_ID,
};

type TxFn = (tx: unknown) => Promise<unknown>;

/**
 * Build a minimal mock Drizzle db. Two outer selects are expected:
 *   select call 0 → emailMessages lookup
 *   select call 1 → emailThreads lookup
 */
function makeMockDb(opts: {
  msgRow?: typeof MSG_ROW | null;
  threadRow?: typeof THREAD_ROW | null;
  runId?: string;
  classId?: string;
  txOverride?: (fn: TxFn) => Promise<unknown>;
} = {}) {
  const {
    msgRow = MSG_ROW,
    threadRow = THREAD_ROW,
    runId = RUN_ID,
    classId = CLASS_ID,
    txOverride,
  } = opts;

  let selectIdx = 0;
  const selectImpl = vi.fn().mockImplementation(() => {
    const i = selectIdx++;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (i === 0) return Promise.resolve(msgRow ? [msgRow] : []);
            return Promise.resolve(threadRow ? [threadRow] : []);
          }),
        }),
      }),
    };
  });

  // For failed-run insert outside of transaction
  const failInsertImpl = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "failed-run-id" }]),
    }),
  });

  const defaultTx = vi.fn().mockImplementation(async (fn: TxFn) => {
    const txInsert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          // First call = cosRuns, second = agentClassifications
          const callCount = (txInsert.mock.calls.length as number);
          if (callCount === 1) return Promise.resolve([{ id: runId }]);
          return Promise.resolve([{ id: classId }]);
        }),
      }),
    }));
    const txUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      }),
    });
    return fn({ insert: txInsert, update: txUpdate });
  });

  const txImpl = txOverride
    ? vi.fn().mockImplementation(async (fn: TxFn) => txOverride(fn))
    : defaultTx;

  return {
    select: selectImpl,
    insert: failInsertImpl,
    transaction: txImpl,
    _failInsert: failInsertImpl,
    _defaultTx: defaultTx,
  } as unknown as typeof DbType & {
    _failInsert: ReturnType<typeof vi.fn>;
    _defaultTx: ReturnType<typeof vi.fn>;
  };
}

function makeOpenAI(rawJson: string, opts: { useOutputArray?: boolean } = {}) {
  const { useOutputArray = false } = opts;
  const response = useOutputArray
    ? {
        output: [
          {
            content: [{ type: "output_text", text: rawJson }],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }
    : {
        output_text: rawJson,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

  return {
    responses: {
      create: vi.fn().mockResolvedValue(response),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: makeStrict
// ---------------------------------------------------------------------------

describe("makeStrict", () => {
  it("adds additionalProperties:false and required to a simple object schema", () => {
    const input = {
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { type: "number" },
      },
    };
    const result = makeStrict(input) as Record<string, unknown>;
    expect(result.additionalProperties).toBe(false);
    expect(result.required).toEqual(["foo", "bar"]);
  });

  it("recurses into nested object properties", () => {
    const input = {
      type: "object",
      properties: {
        outer: { type: "string" },
        inner: {
          type: "object",
          properties: {
            x: { type: "number" },
          },
        },
      },
    };
    const result = makeStrict(input) as Record<string, unknown>;
    const props = result.properties as Record<string, unknown>;
    const inner = props.inner as Record<string, unknown>;
    expect(inner.additionalProperties).toBe(false);
    expect(inner.required).toEqual(["x"]);
  });

  it("recurses into arrays", () => {
    const input = [
      {
        type: "object",
        properties: { a: { type: "string" } },
      },
    ];
    const result = makeStrict(input) as unknown[];
    const first = result[0] as Record<string, unknown>;
    expect(first.additionalProperties).toBe(false);
  });

  it("leaves non-object schema nodes unchanged", () => {
    expect(makeStrict("string")).toBe("string");
    expect(makeStrict(42)).toBe(42);
    expect(makeStrict(null)).toBe(null);
  });

  it("does not mutate an object that has no properties key", () => {
    const input = { type: "string", enum: ["a", "b"] };
    const result = makeStrict(input) as Record<string, unknown>;
    expect(result.additionalProperties).toBeUndefined();
    expect(result.required).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: estimateCostUsd
// ---------------------------------------------------------------------------

describe("estimateCostUsd", () => {
  it("returns 0 for zero tokens", () => {
    expect(estimateCostUsd("gpt-5-mini", 0, 0)).toBe(0);
  });

  it("returns 0 for unknown model", () => {
    expect(estimateCostUsd("unknown-model", 1000, 500)).toBe(0);
  });

  it("computes correct cost for gpt-5-mini with known token counts", () => {
    // 1,000,000 input @ $0.25/M + 500,000 output @ $2.00/M = $0.25 + $1.00 = $1.25
    const cost = estimateCostUsd("gpt-5-mini", 1_000_000, 500_000);
    expect(cost).toBeCloseTo(1.25, 6);
  });

  it("computes correct cost for gpt-5", () => {
    // 1,000,000 input @ $1.25/M + 1,000,000 output @ $10.00/M = $11.25
    const cost = estimateCostUsd("gpt-5", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(11.25, 6);
  });
});

// ---------------------------------------------------------------------------
// Tests: classifyMessage
// ---------------------------------------------------------------------------

describe("classifyMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: parses response, inserts cos_run + classification, denormalizes thread", async () => {
    const db = makeMockDb();
    const openai = makeOpenAI(JSON.stringify(VALID_CLASSIFICATION));

    const result = await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    expect(result.classification).toEqual(VALID_CLASSIFICATION);
    expect(result.cosRunId).toBe(RUN_ID);
    expect(result.agentClassificationId).toBe(CLASS_ID);

    // Transaction was invoked
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it("extracts text from output array shape (not output_text)", async () => {
    const db = makeMockDb();
    const openai = makeOpenAI(JSON.stringify(VALID_CLASSIFICATION), { useOutputArray: true });

    const result = await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    expect(result.classification.category).toBe("lead_inquiry");
  });

  it("throws and writes failed cos_run when schema parse fails (malformed JSON)", async () => {
    const db = makeMockDb();
    const openai = makeOpenAI("not valid json at all");

    await expect(
      classifyMessage({
        messageId: MSG_ID,
        db: db as unknown as typeof DbType,
        openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
      })
    ).rejects.toThrow();

    // Failed cos_run recorded outside the transaction
    expect(db._failInsert).toHaveBeenCalledOnce();
    const valuesArg = db._failInsert.mock.results[0].value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.status).toBe("failed");
    expect(valuesArg.kind).toBe("classify");

    // Transaction should NOT have been called
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws and writes failed cos_run when schema validation fails (wrong category)", async () => {
    const db = makeMockDb();
    const badClassification = { ...VALID_CLASSIFICATION, category: "not_a_real_category" };
    const openai = makeOpenAI(JSON.stringify(badClassification));

    await expect(
      classifyMessage({
        messageId: MSG_ID,
        db: db as unknown as typeof DbType,
        openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
      })
    ).rejects.toThrow();

    expect(db._failInsert).toHaveBeenCalledOnce();
    const valuesArg = db._failInsert.mock.results[0].value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.status).toBe("failed");
  });

  it("throws and records failed run when OpenAI call rejects (rate limit)", async () => {
    const db = makeMockDb();
    const openai = {
      responses: {
        create: vi.fn().mockRejectedValue(new Error("429 Rate limit exceeded")),
      },
    };

    await expect(
      classifyMessage({
        messageId: MSG_ID,
        db: db as unknown as typeof DbType,
        openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
      })
    ).rejects.toThrow("429 Rate limit exceeded");

    expect(db._failInsert).toHaveBeenCalledOnce();
    const valuesArg = db._failInsert.mock.results[0].value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.status).toBe("failed");
    expect(valuesArg.errorMessage).toBe("429 Rate limit exceeded");
  });

  it("throws with clear message when message is not found", async () => {
    const db = makeMockDb({ msgRow: null });
    const openai = makeOpenAI(JSON.stringify(VALID_CLASSIFICATION));

    await expect(
      classifyMessage({
        messageId: "nonexistent-msg",
        db: db as unknown as typeof DbType,
        openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
      })
    ).rejects.toThrow("Message nonexistent-msg not found");
  });

  it("throws with clear message when thread is not found", async () => {
    const db = makeMockDb({ threadRow: null });
    const openai = makeOpenAI(JSON.stringify(VALID_CLASSIFICATION));

    await expect(
      classifyMessage({
        messageId: MSG_ID,
        db: db as unknown as typeof DbType,
        openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
      })
    ).rejects.toThrow(`Thread ${THREAD_ID} not found`);
  });

  it("denormalizes category and urgency onto email_threads inside the transaction", async () => {
    const updateCalls: Array<{ set: unknown; where: unknown }> = [];

    const db = makeMockDb({
      txOverride: async (fn: TxFn) => {
        const txInsert = vi.fn().mockImplementation(() => ({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementationOnce(() =>
              Promise.resolve([{ id: RUN_ID }])
            ).mockImplementationOnce(() =>
              Promise.resolve([{ id: CLASS_ID }])
            ),
          }),
        }));
        const setCalls: unknown[] = [];
        const txUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((vals: unknown) => {
            setCalls.push(vals);
            return {
              where: vi.fn().mockResolvedValue({ rowCount: 1 }),
            };
          }),
        });
        const result = await fn({ insert: txInsert, update: txUpdate });
        updateCalls.push(...setCalls.map((s) => ({ set: s, where: null })));
        return result;
      },
    });
    const openai = makeOpenAI(JSON.stringify(VALID_CLASSIFICATION));

    await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    expect(updateCalls.length).toBe(1);
    const setArg = updateCalls[0].set as Record<string, unknown>;
    expect(setArg.agentCategory).toBe("lead_inquiry");
    expect(setArg.agentUrgency).toBe("normal");
    expect(setArg.agentState).toBe("classified");
  });

  it("does NOT touch engagements/crmHygieneFlags when related_engagement_id is null", async () => {
    // The default mock db only stubs the first 2 selects (msg + thread).
    // If maybeFlagStageAdvancement were to run, it would do a 3rd select
    // (engagement) which would crash. Happy path covers this implicitly,
    // but pin it explicitly so future refactors don't accidentally call
    // the engagement select for unlinked classifications.
    const db = makeMockDb();
    const openai = makeOpenAI(JSON.stringify(VALID_CLASSIFICATION));

    await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    // Exactly 2 outer selects (msg + thread). No engagement select.
    expect(db.select).toHaveBeenCalledTimes(2);
    // outer-db insert is only used for the failed-run path; it must not be
    // called on the happy path (the hygiene-flag insert below is only
    // triggered when an engagement is linked).
    expect(db._failInsert).not.toHaveBeenCalled();
  });

  it("flags stage_advancement + sets requires_human when classification links engagement and signal fires", async () => {
    const ENG_ID = "11111111-2222-4222-8444-555555555555";
    const linkedClassification: Classification = {
      ...VALID_CLASSIFICATION,
      category: "client_active",
      intent: "reply_needed",
      requires_reply: true,
      related_engagement_id: ENG_ID,
      related_engagement_confidence: "high",
      reasoning: "Active client confirming kickoff next week",
    };

    // 3-select sequence: msgRow, threadRow, then engagement row with stage='lead'.
    let selectIdx = 0;
    const select = vi.fn().mockImplementation(() => {
      const i = selectIdx++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (i === 0) return Promise.resolve([MSG_ROW]);
              if (i === 1) return Promise.resolve([THREAD_ROW]);
              return Promise.resolve([{ id: ENG_ID, stage: "lead" }]);
            }),
          }),
        }),
      };
    });

    const flagInsertValues = vi.fn();
    const onConflictDoNothing = vi.fn().mockResolvedValue([]);
    const insertOuter = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: unknown) => {
        flagInsertValues(vals);
        return { onConflictDoNothing };
      }),
    }));

    const updateSetSpy = vi.fn();
    const updateOuter = vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((vals: unknown) => {
        updateSetSpy(vals);
        return { where: vi.fn().mockResolvedValue({ rowCount: 1 }) };
      }),
    }));

    const tx = vi.fn().mockImplementation(async (fn: TxFn) => {
      const txInsert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            const callCount = txInsert.mock.calls.length as number;
            if (callCount === 1) return Promise.resolve([{ id: RUN_ID }]);
            return Promise.resolve([{ id: CLASS_ID }]);
          }),
        }),
      }));
      const txUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowCount: 1 }),
        }),
      });
      return fn({ insert: txInsert, update: txUpdate });
    });

    const db = {
      select,
      insert: insertOuter,
      update: updateOuter,
      transaction: tx,
    };
    const openai = makeOpenAI(JSON.stringify(linkedClassification));

    await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    // requires_human was set on the thread
    expect(updateSetSpy).toHaveBeenCalled();
    const updateArg = updateSetSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.requiresHuman).toBe(true);

    // hygiene flag insert happened with the expected shape
    expect(flagInsertValues).toHaveBeenCalledOnce();
    const flagArg = flagInsertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(flagArg.kind).toBe("stage_advancement_suggested");
    expect(flagArg.entityKind).toBe("engagement");
    expect(flagArg.entityId).toBe(ENG_ID);
    expect(flagArg.relatedEntityId).toBe(THREAD_ID);
    const details = flagArg.details as Record<string, unknown>;
    expect(details.from_stage).toBe("lead");
    expect(details.to_stage).toBe("contacted");
    expect(Array.isArray(details.signals)).toBe(true);

    // idempotency call
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("does not flag stage_advancement when the heuristic returns shouldFlag=false", async () => {
    const ENG_ID = "11111111-2222-4222-8444-555555555555";
    // requires_reply=false → lead→contacted rule does NOT fire.
    const linkedClassification: Classification = {
      ...VALID_CLASSIFICATION,
      category: "lead_inquiry",
      requires_reply: false,
      related_engagement_id: ENG_ID,
      related_engagement_confidence: "low",
    };

    let selectIdx = 0;
    const select = vi.fn().mockImplementation(() => {
      const i = selectIdx++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (i === 0) return Promise.resolve([MSG_ROW]);
              if (i === 1) return Promise.resolve([THREAD_ROW]);
              return Promise.resolve([{ id: ENG_ID, stage: "lead" }]);
            }),
          }),
        }),
      };
    });

    const insertOuter = vi.fn();
    const updateOuter = vi.fn();

    const tx = vi.fn().mockImplementation(async (fn: TxFn) => {
      const txInsert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            const callCount = txInsert.mock.calls.length as number;
            if (callCount === 1) return Promise.resolve([{ id: RUN_ID }]);
            return Promise.resolve([{ id: CLASS_ID }]);
          }),
        }),
      }));
      const txUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowCount: 1 }),
        }),
      });
      return fn({ insert: txInsert, update: txUpdate });
    });

    const db = {
      select,
      insert: insertOuter,
      update: updateOuter,
      transaction: tx,
    };
    const openai = makeOpenAI(JSON.stringify(linkedClassification));

    await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    expect(insertOuter).not.toHaveBeenCalled();
    expect(updateOuter).not.toHaveBeenCalled();
  });

  it("does not flag stage_advancement when the linked engagement no longer exists", async () => {
    const ENG_ID = "11111111-2222-4222-8444-555555555555";
    const linkedClassification: Classification = {
      ...VALID_CLASSIFICATION,
      category: "client_active",
      requires_reply: true,
      related_engagement_id: ENG_ID,
      related_engagement_confidence: "medium",
    };

    let selectIdx = 0;
    const select = vi.fn().mockImplementation(() => {
      const i = selectIdx++;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (i === 0) return Promise.resolve([MSG_ROW]);
              if (i === 1) return Promise.resolve([THREAD_ROW]);
              return Promise.resolve([]); // engagement lookup misses
            }),
          }),
        }),
      };
    });

    const insertOuter = vi.fn();
    const updateOuter = vi.fn();

    const tx = vi.fn().mockImplementation(async (fn: TxFn) => {
      const txInsert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            const callCount = txInsert.mock.calls.length as number;
            if (callCount === 1) return Promise.resolve([{ id: RUN_ID }]);
            return Promise.resolve([{ id: CLASS_ID }]);
          }),
        }),
      }));
      const txUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowCount: 1 }),
        }),
      });
      return fn({ insert: txInsert, update: txUpdate });
    });

    const db = {
      select,
      insert: insertOuter,
      update: updateOuter,
      transaction: tx,
    };
    const openai = makeOpenAI(JSON.stringify(linkedClassification));

    await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    expect(insertOuter).not.toHaveBeenCalled();
    expect(updateOuter).not.toHaveBeenCalled();
  });

  it("records token counts and cost on the successful cos_run row", async () => {
    const runInsertValues: unknown[] = [];

    const db = makeMockDb({
      txOverride: async (fn: TxFn) => {
        let insertCallIdx = 0;
        const txInsert = vi.fn().mockImplementation(() => {
          const idx = insertCallIdx++;
          return {
            values: vi.fn().mockImplementation((vals: unknown) => {
              if (idx === 0) runInsertValues.push(vals);
              return {
                returning: vi.fn().mockResolvedValue(
                  idx === 0 ? [{ id: RUN_ID }] : [{ id: CLASS_ID }]
                ),
              };
            }),
          };
        });
        const txUpdate = vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
        });
        return fn({ insert: txInsert, update: txUpdate });
      },
    });

    const openai = makeOpenAI(JSON.stringify(VALID_CLASSIFICATION));

    await classifyMessage({
      messageId: MSG_ID,
      db: db as unknown as typeof DbType,
      openai: openai as unknown as ReturnType<typeof import("../openai-client").getOpenAI>,
    });

    expect(runInsertValues.length).toBe(1);
    const run = runInsertValues[0] as Record<string, unknown>;
    expect(run.inputTokens).toBe(100);
    expect(run.outputTokens).toBe(50);
    expect(run.status).toBe("succeeded");
    expect(run.kind).toBe("classify");
    // costUsd is a formatted string from toFixed(6)
    expect(typeof run.costUsd).toBe("string");
  });
});
