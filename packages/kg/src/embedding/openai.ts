import OpenAI from "openai";
import type { EmbeddingProvider } from "./provider.js";

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
}

export function createOpenAIEmbeddingProvider(
  opts: OpenAIEmbeddingOptions,
): EmbeddingProvider {
  const client = new OpenAI({ apiKey: opts.apiKey });
  const model = opts.model ?? "text-embedding-3-small";
  return {
    modelName: model,
    modelVersion: "v3",
    dimensions: 1536,
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
