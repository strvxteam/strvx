import { describe, expect, it } from "vitest";
import { createMockEmbeddingProvider } from "../../src/embedding/mock.js";

describe("mock embedding provider", () => {
  it("returns deterministic 1536-dim vectors for the same input", async () => {
    const p = createMockEmbeddingProvider();
    const a = await p.embed("hello world");
    const b = await p.embed("hello world");
    expect(a.length).toBe(1536);
    expect(a).toEqual(b);
  });

  it("returns different vectors for different input", async () => {
    const p = createMockEmbeddingProvider();
    const a = await p.embed("hello");
    const b = await p.embed("world");
    expect(a).not.toEqual(b);
  });
});
