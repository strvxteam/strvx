export interface EmbeddingProvider {
  modelName: string;
  modelVersion: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
