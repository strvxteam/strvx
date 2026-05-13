import { describe, it, expect, vi, beforeEach } from "vitest";
import { emailThreads, agentVoiceSamples } from "@strvx/db";

// Spy on the input passed to openai.responses.create
const responsesCreateInputs: unknown[] = [];

vi.mock("../openai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../openai-client")>();
  return {
    ...actual,
    getOpenAI: vi.fn(),
  };
});

vi.mock("@/trigger/_sentry", () => ({
  recordCosRunFailedBreadcrumb: vi.fn(),
}));

// Mock DB that returns 2 voice samples for the planner mailbox.
vi.mock("@strvx/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@strvx/db")>();
  const SAMPLE_ROWS = [
    {
      sampleCreatedAt: new Date("2026-05-10"),
      messageId: "m1",
      subject: "Welcome aboard",
      sentAt: new Date(),
      toEmails: ["lead@example.com"],
      bodyText: "Excited to chat — talk soon.",
      bodyHtml: null,
      note: null,
    },
    {
      sampleCreatedAt: new Date("2026-05-09"),
      messageId: "m2",
      subject: "Re: deck",
      sentAt: new Date(),
      toEmails: ["client@example.com"],
      bodyText: "Here is the v2 deck. Lmk thoughts.",
      bodyHtml: null,
      note: "concise",
    },
  ];

  const select = vi.fn().mockImplementation(() => {
    return {
      from: vi.fn().mockImplementation((table: unknown) => {
        const isThread = table === actual.emailThreads;
        const isVoice = table === actual.agentVoiceSamples;
        return {
          where: vi.fn().mockReturnValue({
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
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockImplementation(async () =>
                    isVoice ? SAMPLE_ROWS : []
                  ),
              }),
            }),
          }),
        };
      }),
    };
  });

  const insert = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation(() => ({
      returning: vi.fn().mockResolvedValue([{ id: "run-uuid" }]),
    })),
  }));

  const update = vi.fn().mockImplementation(() => ({
    set: vi
      .fn()
      .mockImplementation(() => ({ where: vi.fn().mockResolvedValue({}) })),
  }));

  return { ...actual, db: { select, insert, update } };
});

import { planThread } from "./plan-thread";
import { getOpenAI } from "../openai-client";

// Reference imported tables so the mock's `actual.emailThreads` is resolvable
// and avoids unused-import linter friction.
void emailThreads;
void agentVoiceSamples;

beforeEach(() => {
  vi.clearAllMocks();
  responsesCreateInputs.length = 0;
  (getOpenAI as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    responses: {
      create: vi.fn().mockImplementation(async (args: { input: unknown }) => {
        responsesCreateInputs.push(args.input);
        return {
          output: [
            {
              type: "function_call",
              call_id: "call-1",
              name: "done",
              arguments: JSON.stringify({
                thread_id: "00000000-0000-0000-0000-000000000001",
                summary: "ok",
              }),
            },
          ],
        };
      }),
    },
  });
});

describe("planThread — voice samples injection", () => {
  it("prepends a stable-snapshot voice-samples system block before the user kickoff", async () => {
    await planThread({
      threadId: "00000000-0000-0000-0000-000000000001",
    });

    expect(responsesCreateInputs.length).toBeGreaterThan(0);
    const input = responsesCreateInputs[0] as Array<{
      role?: string;
      content?: string;
    }>;

    // Find the voice-samples block — must be a system message containing
    // the canonical header.
    const voiceIdx = input.findIndex(
      (it) =>
        it.role === "system" &&
        typeof it.content === "string" &&
        it.content.includes("Voice samples (canonical outbound to match tone)")
    );
    expect(voiceIdx).toBeGreaterThan(-1);

    // First system message is the planner system prompt.
    expect(input[0].role).toBe("system");
    // Voice samples come after the system prompt.
    expect(voiceIdx).toBe(1);
    // User kickoff comes after voice samples.
    const userIdx = input.findIndex((it) => it.role === "user");
    expect(userIdx).toBeGreaterThan(voiceIdx);

    // Sample content present.
    const block = input[voiceIdx].content as string;
    expect(block).toContain("Welcome aboard");
    expect(block).toContain("Re: deck");
    expect(block).toContain("Excited to chat");
    expect(block).toContain("--- Sample 1 ---");
    expect(block).toContain("--- Sample 2 ---");
  });
});
