/**
 * Unit tests for AnthropicLLMProvider.
 *
 * We inject a fake SDK module via the package's `__setAnthropicSdkLoader`
 * test hook rather than `vi.mock("@anthropic-ai/sdk", ...)`. Reason: the
 * adapter uses a *dynamic* `import("@anthropic-ai/sdk")` so it can be loaded
 * without the SDK installed, and vitest's mock hoisting doesn't always
 * intercept that path cleanly across module formats. The loader hook gives us
 * a deterministic seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnthropicLLMProvider,
  LLMError,
} from "../../src/llm/index.js";
import {
  __resetAnthropicSdkCache,
  __setAnthropicSdkLoader,
} from "../../src/llm/anthropic.js";

interface FakeMessage {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; name: string; input: unknown }
  >;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

let restoreLoader: () => Promise<unknown>;

function installFakeSdk(opts: {
  create: ReturnType<typeof vi.fn>;
  errorClasses?: {
    AuthenticationError?: new (...args: unknown[]) => Error;
    RateLimitError?: new (...args: unknown[]) => Error;
    APIConnectionError?: new (...args: unknown[]) => Error;
  };
}) {
  class FakeAnthropic {
    messages = { create: opts.create };
    constructor(_opts: { apiKey?: string; baseURL?: string }) {
      // no-op
    }
  }
  const mod = {
    default: FakeAnthropic,
    Anthropic: FakeAnthropic,
    ...(opts.errorClasses ?? {}),
  };
  restoreLoader = __setAnthropicSdkLoader(async () => mod as never);
}

beforeEach(() => {
  __resetAnthropicSdkCache();
});

afterEach(() => {
  // Restore the real loader and clear the cache between tests.
  if (restoreLoader) {
    __setAnthropicSdkLoader(restoreLoader as never);
  }
  __resetAnthropicSdkCache();
});

describe("AnthropicLLMProvider.complete", () => {
  it("maps a text response correctly", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: "hello world" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 4 },
      model: "claude-sonnet-4-6",
    } satisfies FakeMessage));
    installFakeSdk({ create });

    const provider = new AnthropicLLMProvider({
      apiKey: "sk-test",
      modelId: "claude-sonnet-4-6",
    });
    const res = await provider.complete({
      system: "be brief",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
    });

    expect(res.text).toBe("hello world");
    expect(res.inputTokens).toBe(10);
    expect(res.outputTokens).toBe(4);
    expect(res.stopReason).toBe("end_turn");
    expect(res.modelId).toBe("claude-sonnet-4-6");

    expect(create).toHaveBeenCalledTimes(1);
    const firstCallArgs = create.mock.calls[0] as unknown[];
    expect(firstCallArgs[0]).toMatchObject({
      model: "claude-sonnet-4-6",
      system: "be brief",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 100,
    });
  });

  it("maps stop_reason='max_tokens' through to 'max_tokens'", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: "partial" }],
      stop_reason: "max_tokens",
      usage: { input_tokens: 5, output_tokens: 50 },
      model: "claude-sonnet-4-6",
    } satisfies FakeMessage));
    installFakeSdk({ create });
    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    const res = await provider.complete({
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.stopReason).toBe("max_tokens");
  });

  it("maps unknown stop_reasons (e.g. 'refusal') to 'other'", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: "" }],
      stop_reason: "refusal",
      usage: { input_tokens: 1, output_tokens: 0 },
      model: "claude-sonnet-4-6",
    } satisfies FakeMessage));
    installFakeSdk({ create });
    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    const res = await provider.complete({
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.stopReason).toBe("other");
  });

  it("throws kind=auth on 401 (via SDK AuthenticationError)", async () => {
    class FakeAuthError extends Error {
      status = 401;
      constructor() {
        super("auth");
      }
    }
    const create = vi.fn(async () => {
      throw new FakeAuthError();
    });
    installFakeSdk({
      create,
      errorClasses: { AuthenticationError: FakeAuthError as never },
    });

    const provider = new AnthropicLLMProvider({ apiKey: "bad" });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({
      name: "LLMError",
      kind: "auth",
    });
  });

  it("throws kind=auth via status fallback if SDK class isn't exported", async () => {
    class PlainHttpError extends Error {
      status = 403;
      constructor() {
        super("forbidden");
      }
    }
    const create = vi.fn(async () => {
      throw new PlainHttpError();
    });
    installFakeSdk({ create });

    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ name: "LLMError", kind: "auth" });
  });

  it("throws kind=rate_limit on 429", async () => {
    class FakeRateLimit extends Error {
      status = 429;
      constructor() {
        super("rate");
      }
    }
    const create = vi.fn(async () => {
      throw new FakeRateLimit();
    });
    installFakeSdk({
      create,
      errorClasses: { RateLimitError: FakeRateLimit as never },
    });
    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    await expect(
      provider.complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ name: "LLMError", kind: "rate_limit" });
  });
});

describe("AnthropicLLMProvider.completeJSON", () => {
  it("forces tool_use and parses the tool input", async () => {
    const create = vi.fn(async () => ({
      content: [
        {
          type: "tool_use",
          name: "respond_json",
          input: { result: "yes", confidence: 0.87 },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 20, output_tokens: 8 },
      model: "claude-sonnet-4-6",
    } satisfies FakeMessage));
    installFakeSdk({ create });

    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    interface Out {
      result: string;
      confidence: number;
    }
    const res = await provider.completeJSON<Out>({
      messages: [{ role: "user", content: "are these the same?" }],
      schema: {
        type: "object",
        properties: {
          result: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["result", "confidence"],
      },
      parse: (o) => o as Out,
    });

    expect(res.data).toEqual({ result: "yes", confidence: 0.87 });
    expect(res.inputTokens).toBe(20);
    expect(res.outputTokens).toBe(8);

    // Verify we wired the tool_choice + tools correctly.
    const jsonCallArgs = create.mock.calls[0] as unknown[];
    const params = jsonCallArgs[0] as Record<string, unknown>;
    expect(params.tool_choice).toEqual({
      type: "tool",
      name: "respond_json",
    });
    expect(params.tools).toEqual([
      {
        name: "respond_json",
        description: "Return structured JSON per the input schema",
        input_schema: {
          type: "object",
          properties: {
            result: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["result", "confidence"],
        },
      },
    ]);
  });

  it("throws kind=invalid_response when tool_use block is missing", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: "I refuse to use the tool" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 6 },
      model: "claude-sonnet-4-6",
    } satisfies FakeMessage));
    installFakeSdk({ create });

    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    await expect(
      provider.completeJSON({
        messages: [{ role: "user", content: "x" }],
        schema: {},
        parse: (o) => o,
      }),
    ).rejects.toMatchObject({
      name: "LLMError",
      kind: "invalid_response",
    });
  });

  it("throws kind=schema when parse() throws", async () => {
    const create = vi.fn(async () => ({
      content: [
        { type: "tool_use", name: "respond_json", input: { wrong: 1 } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 2 },
      model: "claude-sonnet-4-6",
    } satisfies FakeMessage));
    installFakeSdk({ create });

    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    await expect(
      provider.completeJSON({
        messages: [{ role: "user", content: "x" }],
        schema: {},
        parse: () => {
          throw new Error("does not match");
        },
      }),
    ).rejects.toMatchObject({
      name: "LLMError",
      kind: "schema",
    });
  });
});

describe("AnthropicLLMProvider SDK loading", () => {
  it("throws kind=transport when SDK can't be imported", async () => {
    restoreLoader = __setAnthropicSdkLoader(async () => {
      throw new Error("MODULE_NOT_FOUND");
    });
    const provider = new AnthropicLLMProvider({ apiKey: "k" });
    const err = await provider
      .complete({ messages: [{ role: "user", content: "x" }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect((err as LLMError).kind).toBe("transport");
    expect((err as LLMError).message).toMatch(/@anthropic-ai\/sdk not installed/);
  });
});
