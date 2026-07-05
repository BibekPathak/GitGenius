import { PrismaClient } from "@prisma/client";
import { Bm25Index, type Bm25Document } from "./bm25.js";
import { searchByVector } from "./vector.js";
import { hybridSearch } from "./hybrid.js";
import type { SearchResult, SearchOptions } from "./types.js";
import type { EmbeddingProvider } from "../embeddings/types.js";

export async function search(
  db: PrismaClient,
  repoId: string,
  query: string,
  embedder: EmbeddingProvider,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  // Load analyzed chunks with embeddings
  const chunks = await db.chunk.findMany({
    where: { repositoryId: repoId, status: "ANALYZED" },
    orderBy: { startIndex: "asc" },
    include: {
      embeddings: { take: 1, orderBy: { createdAt: "desc" } },
      commits: {
        include: { commit: { select: { message: true, hash: true, authorName: true, authorDate: true } } },
      },
    },
  });

  if (chunks.length === 0) return [];

  // Build BM25 index
  const bm25Index = new Bm25Index();
  const chunkDataMap = new Map<
    string,
    {
      summary: string;
      keywords: string[];
      commitCount: number;
      startIndex: number;
      endIndex: number;
    }
  >();

  for (const chunk of chunks) {
    const keywords: string[] = chunk.keywords
      ? (JSON.parse(chunk.keywords) as string[])
      : [];
    const messages = chunk.commits.map((cc) => cc.commit.message).join(" ");
    const text = [chunk.summary ?? "", ...keywords, messages].join(" ");

    bm25Index.add({ id: chunk.id, text });

    chunkDataMap.set(chunk.id, {
      summary: chunk.summary ?? "",
      keywords,
      commitCount: chunk.commitCount,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
    });
  }

  // BM25 search
  const bm25Scores = bm25Index.search(query);

  // Vector search
  let vectorScores = new Map<string, { score: number; docId: string }>();

  const chunksWithVectors = chunks.filter((c) => c.embeddings.length > 0);
  if (chunksWithVectors.length > 0) {
    try {
      const queryVector = await embedder.embed(query);

      const vectorDocs = chunksWithVectors.map((c) => ({
        id: c.id,
        vector: JSON.parse(c.embeddings[0]!.vector) as number[],
      }));

      vectorScores = searchByVector(queryVector.vector, vectorDocs);
    } catch {
      // Vector search failed; proceed with BM25 only
    }
  }

  // Hybrid ranking
  let results = hybridSearch(bm25Scores, vectorScores, chunkDataMap, options);

  // Attach commits to results
  const chunkCommits = new Map(chunks.map((c) => [c.id, c.commits]));
  for (const result of results) {
    const commits = chunkCommits.get(result.chunkId) ?? [];
    result.commits = commits.map((cc) => ({
      hash: cc.commit.hash,
      message: cc.commit.message,
      authorName: cc.commit.authorName,
      authorDate: cc.commit.authorDate,
    }));
  }

  return results;
}
