import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./provider";

/** Deterministic, content-derived pseudo-embeddings for tests. Never use in prod. */
export function createMockEmbeddingProvider(dimensions = 1536): EmbeddingProvider {
  return {
    modelName: "mock",
    modelVersion: "0.0.0",
    dimensions,
    async embed(text: string): Promise<number[]> {
      const seed = createHash("sha256").update(text).digest();
      const out = new Array<number>(dimensions);
      for (let i = 0; i < dimensions; i++) {
        const b = seed[i % seed.length];
        out[i] = (b / 255) * 2 - 1; // [-1, 1]
      }
      // L2-normalize so cosine similarity behaves like a unit-sphere comparison.
      const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0));
      return out.map((x) => x / norm);
    },
    async embedBatch(texts: string[]) {
      return Promise.all(texts.map((t) => this.embed(t)));
    },
  };
}
