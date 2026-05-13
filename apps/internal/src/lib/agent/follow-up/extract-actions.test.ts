import { describe, it, expect, vi, beforeEach } from "vitest";
import type { db as DbType } from "@strvx/db";
import {
  engagements,
  contacts,
  users,
  cosRuns,
  nextActions,
} from "@strvx/db";
import { extractActionsFromNotes } from "./extract-actions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type OwnerState = {
  primaryContactEmail: string | null;
  contactMatchUserId: string | null;
  strvxUserId: string | null;
  anyUserId: string | null;
};

function makeMockDb(opts: {
  owner: OwnerState;
  insertedActionIds?: string[];
  cosRunId?: string;
}) {
  const insertedActionIds = opts.insertedActionIds ?? [];
  let actionInsertIdx = 0;

  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => ({
      where: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockImplementation(async () => {
          if (table === engagements) {
            return [
              {
                primaryContactId: opts.owner.primaryContactEmail
                  ? "contact-1"
                  : null,
              },
            ];
          }
          if (table === contacts) {
            return opts.owner.primaryContactEmail
              ? [{ email: opts.owner.primaryContactEmail }]
              : [];
          }
          if (table === users) {
            if (opts.owner.contactMatchUserId) {
              return [{ id: opts.owner.contactMatchUserId }];
            }
            if (opts.owner.strvxUserId) {
              return [{ id: opts.owner.strvxUserId }];
            }
            return [];
          }
          return [];
        }),
      })),
      // Last-resort "any user" path: select().from(users).limit(1) without where.
      limit: vi.fn().mockImplementation(async () => {
        if (table === users && opts.owner.anyUserId) {
          return [{ id: opts.owner.anyUserId }];
        }
        return [];
      }),
    })),
  }));

  // Top-level db.insert (failure path)
  const topInsertValues = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "failed-run-id" }]),
  });
  const topInsert = vi.fn().mockReturnValue({ values: topInsertValues });

  // Transaction
  let txInsertCalls = 0;
  const txInsertValues = vi.fn().mockImplementation(() => ({
    returning: vi.fn().mockImplementation(async () => {
      const i = txInsertCalls++;
      if (i === 0) {
        return [{ id: opts.cosRunId ?? "run-1" }];
      }
      const idIdx = actionInsertIdx++;
      return [
        { id: insertedActionIds[idIdx] ?? `act-${idIdx + 1}` },
      ];
    }),
  }));
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

  const transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({ insert: txInsert });
    });

  return {
    select,
    insert: topInsert,
    transaction,
    _txInsert: txInsert,
    _txInsertValues: txInsertValues,
    _topInsertValues: topInsertValues,
  } as unknown as typeof DbType & {
    _txInsert: ReturnType<typeof vi.fn>;
    _txInsertValues: ReturnType<typeof vi.fn>;
    _topInsertValues: ReturnType<typeof vi.fn>;
  };
}

function makeOpenAI(opts: {
  output: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: Error;
}) {
  const create = vi.fn().mockImplementation(async () => {
    if (opts.error) throw opts.error;
    return {
      output_text: opts.output,
      usage: {
        input_tokens: opts.inputTokens ?? 50,
        output_tokens: opts.outputTokens ?? 30,
      },
    };
  });
  return { responses: { create } } as unknown as ReturnType<
    typeof import("../openai-client").getOpenAI
  >;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractActionsFromNotes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts N next_actions when the model returns N items", async () => {
    const db = makeMockDb({
      owner: {
        primaryContactEmail: null,
        contactMatchUserId: null,
        strvxUserId: "strvx-user-1",
        anyUserId: null,
      },
      insertedActionIds: ["act-a", "act-b"],
    });
    const openai = makeOpenAI({
      output: JSON.stringify({
        actions: [
          {
            description: "Send proposal draft to Sarah",
            due_date: "2026-05-15",
            priority: "high",
          },
          {
            description: "Schedule technical deep-dive next week",
            due_date: null,
            priority: "normal",
          },
        ],
      }),
    });

    const result = await extractActionsFromNotes({
      db,
      openai,
      engagementId: "eng-1",
      notesText: "Meeting notes...",
      mailboxId: "mb-1",
      calendarEventId: "g-evt-1",
    });

    expect(result.insertedActionIds).toEqual(["act-a", "act-b"]);
    expect(result.actions).toHaveLength(2);
    expect(db._txInsert).toHaveBeenCalledTimes(3); // 1 cos_runs + 2 next_actions

    const actionValues = db._txInsertValues.mock.calls
      .slice(1)
      .map((c) => c[0]);
    expect(actionValues[0]).toMatchObject({
      engagementId: "eng-1",
      ownerId: "strvx-user-1",
      description: "Send proposal draft to Sarah",
      priority: "high",
      dueDate: "2026-05-15",
      createdByAgent: true,
    });
    expect(actionValues[1]).toMatchObject({
      ownerId: "strvx-user-1",
      priority: "normal",
      dueDate: null,
    });
  });

  it("returns empty result when notesText is whitespace and skips LLM", async () => {
    const db = makeMockDb({
      owner: {
        primaryContactEmail: null,
        contactMatchUserId: null,
        strvxUserId: "strvx-1",
        anyUserId: null,
      },
    });
    const openai = makeOpenAI({ output: "{}" });

    const result = await extractActionsFromNotes({
      db,
      openai,
      engagementId: "eng-1",
      notesText: "   \n  ",
    });

    expect(result.insertedActionIds).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(
      (openai as unknown as { responses: { create: ReturnType<typeof vi.fn> } })
        .responses.create
    ).not.toHaveBeenCalled();
    expect(db._txInsert).not.toHaveBeenCalled();
  });

  it("zero-action response inserts cos_runs but no next_actions", async () => {
    const db = makeMockDb({
      owner: {
        primaryContactEmail: null,
        contactMatchUserId: null,
        strvxUserId: "strvx-1",
        anyUserId: null,
      },
    });
    const openai = makeOpenAI({
      output: JSON.stringify({ actions: [] }),
    });

    const result = await extractActionsFromNotes({
      db,
      openai,
      engagementId: "eng-1",
      notesText: "We discussed the weather.",
    });

    expect(result.insertedActionIds).toEqual([]);
    expect(result.actions).toEqual([]);
    // Only cos_runs row written.
    expect(db._txInsert).toHaveBeenCalledTimes(1);
  });

  it("writes failed cos_runs row and rethrows on LLM error", async () => {
    const db = makeMockDb({
      owner: {
        primaryContactEmail: null,
        contactMatchUserId: null,
        strvxUserId: "strvx-1",
        anyUserId: null,
      },
    });
    const err = new Error("model exploded");
    const openai = makeOpenAI({ output: "", error: err });

    await expect(
      extractActionsFromNotes({
        db,
        openai,
        engagementId: "eng-1",
        notesText: "Some notes.",
      })
    ).rejects.toThrow(/model exploded/);

    // Top-level db.insert (not the transaction) recorded the failure.
    expect(db._topInsertValues).toHaveBeenCalledTimes(1);
    const failedRow = db._topInsertValues.mock.calls[0][0];
    expect(failedRow).toMatchObject({
      kind: "extract_actions",
      status: "failed",
      engagementId: "eng-1",
      errorMessage: "model exploded",
    });
  });

  it("throws when no eligible owner can be resolved", async () => {
    const db = makeMockDb({
      owner: {
        primaryContactEmail: null,
        contactMatchUserId: null,
        strvxUserId: null,
        anyUserId: null,
      },
    });
    const openai = makeOpenAI({
      output: JSON.stringify({ actions: [] }),
    });

    await expect(
      extractActionsFromNotes({
        db,
        openai,
        engagementId: "eng-orphan",
        notesText: "notes",
      })
    ).rejects.toThrow(/no eligible owner/);
  });
});

// Make module-load suppress unused-imports.
void cosRuns;
void nextActions;
