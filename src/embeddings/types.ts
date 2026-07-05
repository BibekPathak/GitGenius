export interface EmbeddingResult {
  vector: number[];
  model: string;
  dimension: number;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  name: string;
}
