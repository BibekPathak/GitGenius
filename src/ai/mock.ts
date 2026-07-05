import type { AIProvider, ChunkData, ChunkAnalysis, AIProviderName } from "./types.js";

export function createMockProvider(
  customAnalyze?: (chunk: ChunkData) => Promise<ChunkAnalysis>
): AIProvider {
  return {
    name: "gemini" as AIProviderName,

    async analyze(chunk: ChunkData): Promise<ChunkAnalysis> {
      if (customAnalyze) {
        return customAnalyze(chunk);
      }

      return {
        summary: `Analysis of ${chunk.commits.length} commits in ${chunk.repository}`,
        category: "refactor",
        risk: "low",
        keywords: chunk.commits.flatMap((c) => c.message.split(/\s+/).filter((w) => w.length > 5)),
        confidence: 0.85,
      };
    },
  };
}
