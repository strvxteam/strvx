/**
 * Anthropic adapter for {@link LLMProvider}.
 *
 * The SDK is loaded via dynamic `import("@anthropic-ai/sdk")` on first use so
 * that environments which don't install the optional peer dependency can still
 * import this module (they just can't *call* it). Failure to import surfaces as
 * an {@link LLMError} with `kind: "transport"`.
 */
import {
  LLMError,
  type LLMCompletionRequest,
  type LLMCompletionResult,
  type LLMJSONRequest,
  type LLMJSONResult,
  type LLMProvider,
} from "./provider";

export interface AnthropicLLMOptions {
  /** Defaults to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /** Defaults to `claude-sonnet-4-6`. */
  modelId?: string;
  /** Custom base URL — useful for proxies or Bedrock. */
  baseURL?: string;
  /** Default max output tokens (caller can override per request). Default 1024. */
  defaultMaxTokens?: number;
}

/**
 * Minimal shape we rely on from `@anthropic-ai/sdk`. Defined inline so we
 * don't need to import the SDK at module load time.
 */
interface AnthropicSDKMessage {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; name: string; input: unknown }
    | { type: string; [k: string]: unknown }
  >;
  stop_reason:
    | "end_turn"
    | "max_tokens"
    | "stop_sequence"
    | "tool_use"
    | "pause_turn"
    | "refusal"
    | string
    | null;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

interface AnthropicSDKClient {
  messages: {
    create: (params: Record<string, unknown>) => Promise<AnthropicSDKMessage>;
  };
}

interface AnthropicSDKModule {
  default: new (opts: {
    apiKey?: string;
    baseURL?: string;
  }) => AnthropicSDKClient;
  Anthropic?: new (opts: {
    apiKey?: string;
    baseURL?: string;
  }) => AnthropicSDKClient;
  // Error classes — present in modern SDKs (>=0.30).
  APIError?: new (...args: unknown[]) => Error;
  AuthenticationError?: new (...args: unknown[]) => Error;
  RateLimitError?: new (...args: unknown[]) => Error;
  APIConnectionError?: new (...args: unknown[]) => Error;
  APIConnectionTimeoutError?: new (...args: unknown[]) => Error;
}

/** Cached SDK module — loaded once per process. */
let cachedSdk: AnthropicSDKModule | null = null;

/**
 * Loader is overridable so tests can inject a mock without relying on
 * vitest's module hoisting against a dynamic `import()` (which doesn't always
 * see the mock).
 */
let sdkLoader: () => Promise<AnthropicSDKModule> = async () => {
  // Cast: TypeScript can't statically know whether @anthropic-ai/sdk is
  // installed in this environment.
  return (await import(
    "@anthropic-ai/sdk"
  )) as unknown as AnthropicSDKModule;
};

/**
 * Test/advanced hook to swap the SDK loader. Returns the previous loader so
 * tests can restore it. Not part of the public API surface.
 */
export function __setAnthropicSdkLoader(
  loader: () => Promise<AnthropicSDKModule>,
): () => Promise<AnthropicSDKModule> {
  const prev = sdkLoader;
  sdkLoader = loader;
  cachedSdk = null;
  return prev;
}

/** Reset cached SDK module — used by tests between scenarios. */
export function __resetAnthropicSdkCache(): void {
  cachedSdk = null;
}

async function loadSdk(): Promise<AnthropicSDKModule> {
  if (cachedSdk) return cachedSdk;
  try {
    cachedSdk = await sdkLoader();
    return cachedSdk;
  } catch (err) {
    throw new LLMError(
      "@anthropic-ai/sdk not installed — install it as a peer dep to use AnthropicLLMProvider",
      err,
      "transport",
    );
  }
}

function mapStopReason(
  raw: AnthropicSDKMessage["stop_reason"],
): LLMCompletionResult["stopReason"] {
  switch (raw) {
    case "end_turn":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    case "tool_use":
      return "tool_use";
    default:
      return "other";
  }
}

/**
 * Map an SDK / fetch error to an {@link LLMError} with the right `kind`.
 * Falls back to `"other"` for anything we don't recognize.
 */
function mapError(sdk: AnthropicSDKModule, err: unknown): LLMError {
  // Already mapped — let it propagate untouched.
  if (err instanceof LLMError) return err;

  // SDK error classes (when present) — best signal.
  if (sdk.AuthenticationError && err instanceof sdk.AuthenticationError) {
    return new LLMError("Anthropic auth failed", err, "auth");
  }
  if (sdk.RateLimitError && err instanceof sdk.RateLimitError) {
    return new LLMError("Anthropic rate limit", err, "rate_limit");
  }
  if (
    (sdk.APIConnectionError && err instanceof sdk.APIConnectionError) ||
    (sdk.APIConnectionTimeoutError &&
      err instanceof sdk.APIConnectionTimeoutError)
  ) {
    return new LLMError("Anthropic transport error", err, "transport");
  }

  // Fall back to inspecting `status` (the SDK's APIError carries it).
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: unknown }).status
      : undefined;
  if (status === 401 || status === 403) {
    return new LLMError("Anthropic auth failed", err, "auth");
  }
  if (status === 429) {
    return new LLMError("Anthropic rate limit", err, "rate_limit");
  }
  if (typeof status === "number" && status >= 500) {
    return new LLMError("Anthropic transport error", err, "transport");
  }

  // Network errors typically come up as TypeError("fetch failed") or similar.
  if (err instanceof TypeError) {
    return new LLMError("Anthropic transport error", err, "transport");
  }

  return new LLMError(
    err instanceof Error ? err.message : "Anthropic call failed",
    err,
    "other",
  );
}

const TOOL_NAME = "respond_json";

export class AnthropicLLMProvider implements LLMProvider {
  readonly modelId: string;
  private readonly apiKey?: string;
  private readonly baseURL?: string;
  private readonly defaultMaxTokens: number;
  private clientPromise: Promise<{
    sdk: AnthropicSDKModule;
    client: AnthropicSDKClient;
  }> | null = null;

  constructor(opts: AnthropicLLMOptions = {}) {
    this.modelId = opts.modelId ?? "claude-sonnet-4-6";
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseURL = opts.baseURL;
    this.defaultMaxTokens = opts.defaultMaxTokens ?? 1024;
  }

  private async getClient(): Promise<{
    sdk: AnthropicSDKModule;
    client: AnthropicSDKClient;
  }> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const sdk = await loadSdk();
        const Ctor = sdk.default ?? sdk.Anthropic;
        if (!Ctor) {
          throw new LLMError(
            "Loaded @anthropic-ai/sdk module has no Anthropic constructor",
            undefined,
            "transport",
          );
        }
        const client = new Ctor({
          apiKey: this.apiKey,
          ...(this.baseURL ? { baseURL: this.baseURL } : {}),
        });
        return { sdk, client };
      })().catch((err) => {
        // Surface and let the next call retry — don't cache a poisoned promise.
        this.clientPromise = null;
        throw err;
      });
    }
    return this.clientPromise;
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResult> {
    const { sdk, client } = await this.getClient();
    try {
      const params: Record<string, unknown> = {
        model: this.modelId,
        messages: req.messages,
        max_tokens: req.maxTokens ?? this.defaultMaxTokens,
      };
      if (req.system !== undefined) params.system = req.system;
      if (req.temperature !== undefined) params.temperature = req.temperature;

      const res = await client.messages.create(params);
      const text = res.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        stopReason: mapStopReason(res.stop_reason),
        modelId: res.model ?? this.modelId,
      };
    } catch (err) {
      throw mapError(sdk, err);
    }
  }

  async completeJSON<T>(req: LLMJSONRequest<T>): Promise<LLMJSONResult<T>> {
    const { sdk, client } = await this.getClient();

    let res: AnthropicSDKMessage;
    try {
      const params: Record<string, unknown> = {
        model: this.modelId,
        messages: req.messages,
        max_tokens: req.maxTokens ?? this.defaultMaxTokens,
        tools: [
          {
            name: TOOL_NAME,
            description: "Return structured JSON per the input schema",
            input_schema: req.schema,
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
      };
      if (req.system !== undefined) params.system = req.system;
      if (req.temperature !== undefined) params.temperature = req.temperature;

      res = await client.messages.create(params);
    } catch (err) {
      throw mapError(sdk, err);
    }

    const toolBlock = res.content.find(
      (b): b is { type: "tool_use"; name: string; input: unknown } =>
        b.type === "tool_use" && (b as { name?: string }).name === TOOL_NAME,
    );
    if (!toolBlock) {
      throw new LLMError(
        `Anthropic response missing tool_use block for '${TOOL_NAME}'`,
        res,
        "invalid_response",
      );
    }

    let data: T;
    try {
      data = req.parse(toolBlock.input);
    } catch (err) {
      throw new LLMError(
        "Anthropic tool_use input failed schema validation",
        err,
        "schema",
      );
    }

    return {
      data,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      modelId: res.model ?? this.modelId,
    };
  }
}
