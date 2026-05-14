/**
 * Unit tests for MockLLMProvider.
 */
import { describe, expect, it } from "vitest";
import {
  LLMError,
  MockLLMProvider,
} from "../../src/llm/index.js";

describe("MockLLMProvider", () => {
  it("returns text responses in order", async () => {
    const mock = new MockLLMProvider({
      responses: [
        { kind: "text", text: "first", inputTokens: 5, outputTokens: 1 },
        { kind: "text", text: "second", stopReason: "max_tokens" },
      ],
    });

    const a = await mock.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(a.text).toBe("first");
    expect(a.inputTokens).toBe(5);
    expect(a.outputTokens).toBe(1);
    expect(a.stopReason).toBe("end_turn");
    expect(a.modelId).toBe("mock");

    const b = await mock.complete({ messages: [{ role: "user", content: "again" }] });
    expect(b.text).toBe("second");
    expect(b.stopReason).toBe("max_tokens");
  });

  it("returns JSON, runs the parser, returns typed data", async () => {
    interface Shape {
      name: string;
      score: number;
    }
    const parse = (obj: unknown): Shape => {
      const o = obj as Shape;
      if (typeof o.name !== "string" || typeof o.score !== "number") {
        throw new Error("invalid");
      }
      return o;
    };

    const mock = new MockLLMProvider({
      responses: [
        {
          kind: "json",
          data: { name: "Acme", score: 0.92 },
          inputTokens: 12,
          outputTokens: 3,
        },
      ],
    });

    const res = await mock.completeJSON<Shape>({
      messages: [{ role: "user", content: "extract" }],
      schema: {},
      parse,
    });
    expect(res.data.name).toBe("Acme");
    expect(res.data.score).toBe(0.92);
    expect(res.inputTokens).toBe(12);
    expect(res.outputTokens).toBe(3);
  });

  it("throws kind=schema when parser fails", async () => {
    const mock = new MockLLMProvider({
      responses: [{ kind: "json", data: { wrong: true } }],
    });
    await expect(
      mock.completeJSON({
        messages: [{ role: "user", content: "x" }],
        schema: {},
        parse: () => {
          throw new Error("nope");
        },
      }),
    ).rejects.toMatchObject({
      name: "LLMError",
      kind: "schema",
    });
  });

  it("throws kind=other when script exhausted", async () => {
    const mock = new MockLLMProvider({ responses: [] });
    await expect(
      mock.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ name: "LLMError", kind: "other" });
  });

  it("throws kind=other when script/call shape mismatches", async () => {
    const mock = new MockLLMProvider({
      responses: [{ kind: "json", data: {} }],
    });
    await expect(
      mock.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ name: "LLMError", kind: "other" });
  });

  it("propagates scripted errors via the `error` kind", async () => {
    const boom = new LLMError("planned failure", undefined, "rate_limit");
    const mock = new MockLLMProvider({
      responses: [{ kind: "error", error: boom }],
    });
    await expect(
      mock.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toBe(boom);
  });

  it("records calls in `.calls` with method + request", async () => {
    const mock = new MockLLMProvider({
      responses: [
        { kind: "text", text: "ok" },
        { kind: "json", data: { v: 1 } },
      ],
    });
    await mock.complete({
      messages: [{ role: "user", content: "first" }],
      requestId: "r-1",
    });
    await mock.completeJSON({
      messages: [{ role: "user", content: "second" }],
      schema: { type: "object" },
      parse: (o) => o as { v: number },
      requestId: "r-2",
    });

    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toMatchObject({
      method: "complete",
      request: { requestId: "r-1" },
    });
    expect(mock.calls[1]).toMatchObject({
      method: "completeJSON",
      request: { requestId: "r-2" },
    });
  });
});
