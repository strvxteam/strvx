import { describe, it, expect, vi, beforeEach } from "vitest";
import { emailThreads } from "@strvx/db";

// Mock OpenAI client BEFORE importing planThread.
vi.mock("../openai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../openai-client")>();
  return {
    ...actual,
    getOpenAI: vi.fn(),
  };
});

// Mock the DB module to provide a fake drizzle-like surface.
vi.mock("@strvx/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@strvx/db")>();
  return {
    ...actual,
    db: makeMockDbModule(),
  };
});

// Mock Sentry breadcrumb helper — it's a no-op anyway in tests but keeps
// the import side-effect surface explicit.
vi.mock("@/trigger/_sentry", () => ({
  recordCosRunFailedBreadcrumb: vi.fn(),
}));

// Construct the mock db before the planThread import resolves.
const updateSetSpy = vi.fn();
const updateWhereSpy = vi.fn().mockResolvedValue({ rowCount: 1 });
const insertValuesSpy = vi.fn();
let insertedCosRunMeta: unknown = null;

function makeMockDbModule() {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const isThread = table === emailThreads;
      return {
        where: vi.fn().mockImplementation(() => ({
          limit: vi.fn().mockImplementation(async () => {
            if (isThread) {
              return [
                {
                  id: "00000000-0000-0000-0000-000000000001",
                  mailboxId: "mb-1",
                  subject: "Hi",
                  participants: [],
                  agentCategory: null,
                  agentUrgency: null,
                  engagementId: null,
                  messageCount: 0,
                },
              ];
            }
            return [];
          }),
          orderBy: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
        // Voice-samples query: select().from(agentVoiceSamples).innerJoin(...)
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
    }),
  }));

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((v: unknown) => {
      insertValuesSpy(v);
      insertedCosRunMeta = (v as { metadata?: unknown }).metadata ?? null;
      return {
        returning: vi
          .fn()
          .mockResolvedValue([{ id: "run-uuid" }]),
      };
    }),
  }));

  const update = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((values: unknown) => {
      updateSetSpy(values);
      return { where: updateWhereSpy };
    }),
  }));

  return { select, insert, update };
}

// Import AFTER mocks are set up.
import { planThread } from "./plan-thread";
import { getOpenAI } from "../openai-client";

const mockOpenAI = (terminate: boolean) =>
  ({
    responses: {
      create: vi.fn().mockResolvedValue({
        output: terminate
          ? [
              {
                type: "function_call",
                call_id: "call-1",
                name: "done",
                arguments: JSON.stringify({
                  thread_id: "00000000-0000-0000-0000-000000000001",
                  summary: "done from test",
                }),
              },
            ]
          : [{ type: "message", role: "assistant", content: "no tool" }],
      }),
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  }) as unknown as ReturnType<typeof getOpenAI>;

describe("planThread — seedIntent propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedCosRunMeta = null;
    (getOpenAI as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockOpenAI(true)
    );
  });

  it("persists seedIntent into cos_runs.metadata at run-open time", async () => {
    await planThread({
      threadId: "00000000-0000-0000-0000-000000000001",
      seedIntent: "stale_followup",
    });
    expect(insertedCosRunMeta).toMatchObject({
      seedIntent: "stale_followup",
    });
  });

  it("persists seedIntent into cos_runs.metadata at run-close time", async () => {
    await planThread({
      threadId: "00000000-0000-0000-0000-000000000001",
      seedIntent: "no_show_followup",
    });
    // updateSetSpy receives the close-out metadata.
    const closeCall = updateSetSpy.mock.calls.find(
      (c) => (c[0] as { metadata?: unknown }).metadata !== undefined
    );
    expect(closeCall).toBeDefined();
    if (!closeCall) return;
    const meta = (closeCall[0] as { metadata: Record<string, unknown> })
      .metadata;
    expect(meta.seedIntent).toBe("no_show_followup");
  });

  it("omits seedIntent when not provided (backward compat)", async () => {
    await planThread({
      threadId: "00000000-0000-0000-0000-000000000001",
    });
    expect(insertedCosRunMeta).not.toHaveProperty("seedIntent");
  });
});
