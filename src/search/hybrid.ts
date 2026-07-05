import type { SearchResult, SearchOptions } from "./types.js";

export function normalizeScores(
  scores: Map<string, { score: number; docId: string }>
): Map<string, number> {
  const values = Array.from(scores.values());
  if (values.length === 0) return new Map();

  const maxScore = Math.max(...values.map((v) => v.score));
  if (maxScore === 0) return new Map();

  const normalized = new Map<string, number>();
  for (const { score, docId } of values) {
    normalized.set(docId, score / maxScore);
  }
  return normalized;
}

export function hybridSearch(
  bm25Scores: Map<string, { score: number; docId: string }>,
  vectorScores: Map<string, { score: number; docId: string }>,
  chunkData: Map<
    string,
    {
      summary: string;
      keywords: string[];
      commitCount: number;
      startIndex: number;
      endIndex: number;
    }
  >,
  options: SearchOptions = {}
): SearchResult[] {
  const bm25Weight = options.bm25Weight ?? 0.4;
  const vectorWeight = options.vectorWeight ?? 0.6;
  const limit = options.limit ?? 10;

  const bm25Norm = normalizeScores(bm25Scores);
  const vectorNorm = normalizeScores(vectorScores);

  // Combine all unique doc IDs
  const allIds = new Set([
    ...Array.from(bm25Scores.keys()),
    ...Array.from(vectorScores.keys()),
  ]);

  const results: SearchResult[] = [];

  for (const id of allIds) {
    const bm25Val = bm25Norm.get(id) ?? 0;
    const vectorVal = vectorNorm.get(id) ?? 0;

    const combined = bm25Weight * bm25Val + vectorWeight * vectorVal;
    if (combined === 0) continue;

    const data = chunkData.get(id);
    if (!data) continue;

    results.push({
      chunkId: id,
      score: combined,
      bm25Score: bm25Val,
      vectorScore: vectorVal,
      summary: data.summary,
      keywords: data.keywords,
      commitCount: data.commitCount,
      startIndex: data.startIndex,
      endIndex: data.endIndex,
      commits: [],
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
