export interface VectorDoc {
  id: string;
  vector: number[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

export function searchByVector(
  queryVector: number[],
  documents: VectorDoc[]
): Map<string, { score: number; docId: string }> {
  const results = new Map<string, { score: number; docId: string }>();

  for (const doc of documents) {
    const sim = cosineSimilarity(queryVector, doc.vector);
    // Normalize from [-1, 1] to [0, 1]
    const normalizedScore = (sim + 1) / 2;
    results.set(doc.id, { score: normalizedScore, docId: doc.id });
  }

  return results;
}
