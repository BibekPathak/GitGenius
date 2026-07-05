import type { EmbeddingProvider, EmbeddingResult } from "./types.js";

export function createMockEmbedder(
  dimension: number = 4
): EmbeddingProvider {
  return {
    name: "mock",

    async embed(text: string): Promise<EmbeddingResult> {
      // Deterministic pseudo-embedding based on text length
      const vector = Array.from({ length: dimension }, (_, i) =>
        parseFloat(((text.length * (i + 1)) / dimension / 100).toFixed(4))
      );
      return { vector, model: "mock", dimension };
    },

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
      return Promise.all(texts.map((t) => this.embed(t)));
    },
  };
}
