import OpenAI from "openai";
import type { EmbeddingProvider } from "./provider.js";

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  /** Defaults to `text-embedding-3-small`. */
  model?: string;
  /**
   * Override dimensions when using a model not in the known map. Lets callers
   * adopt new OpenAI embedding models without waiting for an SDK update.
   */
  dimensions?: number;
}

/**
 * Known OpenAI embedding models -> native output dimensions.
 * Sync with the pgvector column width in `packages/db/src/schema.ts` if the
 * v1 default model changes.
 */
const KNOWN_OPENAI_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

/**
 * Crude family detector for `modelVersion`. New family => bump as needed.
 */
function modelVersionFor(model: string): string {
  if (model.startsWith("text-embedding-3-")) return "v3";
  if (model === "text-embedding-ada-002") return "ada-002";
  return "unknown";
}

export function createOpenAIEmbeddingProvider(
  opts: OpenAIEmbeddingOptions,
): EmbeddingProvider {
  const client = new OpenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? "text-embedding-3-small";
  const dimensions = opts.dimensions ?? KNOWN_OPENAI_DIMENSIONS[model];
  if (dimensions === undefined) {
    throw new Error(
      `Unknown OpenAI embedding model '${model}' — pass an explicit ` +
        `'dimensions' to createOpenAIEmbeddingProvider() or use one of: ` +
        `${Object.keys(KNOWN_OPENAI_DIMENSIONS).join(", ")}`,
    );
  }
  return {
    modelName: model,
    modelVersion: modelVersionFor(model),
    dimensions,
    async embed(text: string): Promise<number[]> {
      const res = await client.embeddings.create({ model, input: text });
      return res.data[0].embedding;
    },
    async embedBatch(texts: string[]) {
      if (texts.length === 0) return [];
      const res = await client.embeddings.create({ model, input: texts });
      return res.data.map((d) => d.embedding);
    },
  };
}
