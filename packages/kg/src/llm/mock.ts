/**
 * Deterministic test double for {@link LLMProvider}.
 *
 * Pre-program the script with text / json / error responses; each call shifts
 * one off the front. Tests can introspect every recorded call via `.calls`.
 */
import {
  LLMError,
  type LLMCompletionRequest,
  type LLMCompletionResult,
  type LLMJSONRequest,
  type LLMJSONResult,
  type LLMProvider,
} from "./provider";

export type MockLLMResponse =
  | {
      kind: "text";
      text: string;
      stopReason?: LLMCompletionResult["stopReason"];
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      kind: "json";
      data: unknown;
      inputTokens?: number;
      outputTokens?: number;
    }
  | { kind: "error"; error: LLMError };

export interface MockLLMScript {
  /** Pre-programmed responses, consumed in order. */
  responses: MockLLMResponse[];
}

export interface MockLLMCall {
  method: "complete" | "completeJSON";
  request: LLMCompletionRequest | LLMJSONRequest<unknown>;
}

export class MockLLMProvider implements LLMProvider {
  readonly modelId = "mock";
  readonly calls: MockLLMCall[] = [];

  constructor(private readonly script: MockLLMScript) {}

  private take(method: "complete" | "completeJSON"): MockLLMResponse {
    const next = this.script.responses.shift();
    if (!next) {
      throw new LLMError(
        "MockLLMProvider script exhausted",
        undefined,
        "other",
      );
    }
    if (next.kind === "error") {
      throw next.error;
    }
    if (method === "complete" && next.kind !== "text") {
      throw new LLMError(
        `MockLLMProvider script/call mismatch: complete() got '${next.kind}' response`,
        undefined,
        "other",
      );
    }
    if (method === "completeJSON" && next.kind !== "json") {
      throw new LLMError(
        `MockLLMProvider script/call mismatch: completeJSON() got '${next.kind}' response`,
        undefined,
        "other",
      );
    }
    return next;
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResult> {
    this.calls.push({ method: "complete", request: req });
    const next = this.take("complete");
    // take() guarantees text shape past the kind check.
    if (next.kind !== "text") {
      throw new LLMError(
        "MockLLMProvider internal error: expected text response",
        undefined,
        "other",
      );
    }
    return {
      text: next.text,
      inputTokens: next.inputTokens ?? 0,
      outputTokens: next.outputTokens ?? 0,
      stopReason: next.stopReason ?? "end_turn",
      modelId: this.modelId,
    };
  }

  async completeJSON<T>(req: LLMJSONRequest<T>): Promise<LLMJSONResult<T>> {
    this.calls.push({
      method: "completeJSON",
      request: req as LLMJSONRequest<unknown>,
    });
    const next = this.take("completeJSON");
    if (next.kind !== "json") {
      throw new LLMError(
        "MockLLMProvider internal error: expected json response",
        undefined,
        "other",
      );
    }
    let data: T;
    try {
      data = req.parse(next.data);
    } catch (err) {
      throw new LLMError(
        "MockLLMProvider scripted data failed schema validation",
        err,
        "schema",
      );
    }
    return {
      data,
      inputTokens: next.inputTokens ?? 0,
      outputTokens: next.outputTokens ?? 0,
      modelId: this.modelId,
    };
  }
}
