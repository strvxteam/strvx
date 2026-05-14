/**
 * Provider-agnostic LLM interface for the KG package.
 *
 * Several upcoming KG features need a chat/JSON-mode LLM call (conflict
 * detection, probabilistic entity resolution, knowledge synthesis). We define
 * the contract here so the KG package never hard-imports a vendor SDK. Concrete
 * providers (e.g. {@link AnthropicLLMProvider}) live alongside this file.
 *
 * Note: this is *separate* from {@link EmbeddingProvider}. Embeddings are a
 * different surface (vectorization) and are wired through the OpenAI client.
 */

export interface LLMProvider {
  readonly modelId: string;

  /** Free-form chat completion. */
  complete(req: LLMCompletionRequest): Promise<LLMCompletionResult>;

  /**
   * JSON-mode completion. Caller supplies a JSON Schema and a parser
   * (typically a Zod `.parse()` bound function). The provider must guarantee
   * the parsed result conforms to `T` or throw an {@link LLMError}.
   *
   * Anthropic adapter implements this via tool-use forcing.
   */
  completeJSON<T>(req: LLMJSONRequest<T>): Promise<LLMJSONResult<T>>;
}

export interface LLMCompletionRequest {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  /** Caller-supplied correlation id for logs/audit. */
  requestId?: string;
}

export interface LLMCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason:
    | "end_turn"
    | "max_tokens"
    | "stop_sequence"
    | "tool_use"
    | "other";
  modelId: string;
}

export interface LLMJSONRequest<T> {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** JSON Schema (draft 2020-12) describing the expected shape. */
  schema: Record<string, unknown>;
  /** Validator/parser. Must throw if `obj` doesn't match. */
  parse: (obj: unknown) => T;
  maxTokens?: number;
  temperature?: number;
  requestId?: string;
}

export interface LLMJSONResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
}

export type LLMErrorKind =
  | "auth"
  | "rate_limit"
  | "invalid_response"
  | "transport"
  | "schema"
  | "other";

export class LLMError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly kind: LLMErrorKind = "other",
  ) {
    super(message);
    this.name = "LLMError";
  }
}
