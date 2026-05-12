/**
 * Unit tests for createOpenAIEmbeddingProvider.
 * Mocks the OpenAI SDK client so no network calls are made.
 */
import { describe, expect, it, vi } from "vitest";
import { createOpenAIEmbeddingProvider } from "../../src/embedding/openai.js";

// Mock the openai module so we never hit the network.
vi.mock("openai", () => {
  const mockCreate = vi.fn();
  const MockOpenAI = vi.fn(() => ({
    embeddings: { create: mockCreate },
  }));
  (MockOpenAI as unknown as { _mockCreate: typeof mockCreate })._mockCreate = mockCreate;
  return { default: MockOpenAI };
});

async function getCreate() {
  const { default: OpenAI } = await import("openai");
  return (OpenAI as unknown as { _mockCreate: ReturnType<typeof vi.fn> })._mockCreate;
}

describe("createOpenAIEmbeddingProvider", () => {
  it("returns a provider with correct metadata for default model", () => {
    const provider = createOpenAIEmbeddingProvider({ apiKey: "sk-test" });
    expect(provider.modelName).toBe("text-embedding-3-small");
    expect(provider.modelVersion).toBe("v3");
    expect(provider.dimensions).toBe(1536);
  });

  it("uses custom model when specified", () => {
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "sk-test",
      model: "text-embedding-ada-002",
    });
    expect(provider.modelName).toBe("text-embedding-ada-002");
  });

  it("embed() calls OpenAI and returns the embedding vector", async () => {
    const mockCreate = await getCreate();
    mockCreate.mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2, 0.3] }] });

    const provider = createOpenAIEmbeddingProvider({ apiKey: "sk-test" });
    const result = await provider.embed("hello world");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "hello world",
    });
  });

  it("embedBatch() returns empty array for empty input", async () => {
    const provider = createOpenAIEmbeddingProvider({ apiKey: "sk-test" });
    const result = await provider.embedBatch([]);
    expect(result).toEqual([]);
  });

  it("embedBatch() calls OpenAI with all texts and returns all embeddings", async () => {
    const mockCreate = await getCreate();
    mockCreate.mockResolvedValueOnce({
      data: [
        { embedding: [0.1, 0.2] },
        { embedding: [0.3, 0.4] },
      ],
    });

    const provider = createOpenAIEmbeddingProvider({ apiKey: "sk-test" });
    const result = await provider.embedBatch(["foo", "bar"]);
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["foo", "bar"],
    });
  });
});
