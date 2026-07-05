import { PrismaClient } from "@prisma/client";
import { asyncBatch, chunkArray } from "../utils/batch.js";
import { ChunkInput, ChunkStatus } from "../types/index.js";

export const DEFAULT_CHUNK_SIZE = 50;

export async function getChunkedCommits(
  db: PrismaClient,
  repoId: string
): Promise<{ id: string; hash: string; message: string }[]> {
  return db.commit.findMany({
    where: { repositoryId: repoId, status: "INDEXED" },
    orderBy: { authorDate: "asc" },
    select: { id: true, hash: true, message: true },
  });
}

export async function getLastChunkedCommit(
  db: PrismaClient,
  repoId: string
): Promise<string | null> {
  const lastChunk = await db.chunk.findFirst({
    where: { repositoryId: repoId, status: { not: "FAILED" } },
    orderBy: { endIndex: "desc" },
    select: { endIndex: true },
  });
  return lastChunk?.endIndex?.toString() ?? null;
}

export async function getCommitChunkIndex(
  db: PrismaClient,
  repoId: string
): Promise<number> {
  const lastChunk = await db.chunk.findFirst({
    where: { repositoryId: repoId },
    orderBy: { endIndex: "desc" },
    select: { endIndex: true },
  });
  // endIndex is 0-based, so next index = lastChunk.endIndex + 1
  return lastChunk ? lastChunk.endIndex + 1 : 0;
}

export function buildChunks(
  commits: { id: string; hash: string; message: string }[],
  chunkSize: number,
  startFrom: number
): ChunkInput[] {
  const commitBatches = chunkArray(commits, chunkSize);
  const chunks: ChunkInput[] = [];

  let index = startFrom;
  for (const batch of commitBatches) {
    chunks.push({
      startIndex: index,
      endIndex: index + batch.length - 1,
      commitCount: batch.length,
      repositoryId: "", // filled by caller
      commitIds: batch.map((c) => c.id),
    });
    index += batch.length;
  }

  return chunks;
}

export async function storeChunks(
  db: PrismaClient,
  repoId: string,
  chunks: ChunkInput[]
): Promise<number> {
  let stored = 0;

  for (const chunk of chunks) {
    await db.$transaction(async (tx) => {
      const created = await tx.chunk.create({
        data: {
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
          commitCount: chunk.commitCount,
          status: ChunkStatus.PENDING,
          repositoryId: repoId,
        },
      });

      for (const commitId of chunk.commitIds) {
        await tx.chunkCommit.create({
          data: {
            chunkId: created.id,
            commitId,
          },
        });
      }
    });
    stored++;
  }

  return stored;
}

export async function chunkRepository(
  db: PrismaClient,
  repoId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<{ chunksCreated: number; totalCommits: number }> {
  const nextIndex = await getCommitChunkIndex(db, repoId);
  const allCommits = await getChunkedCommits(db, repoId);

  const unprocessedCommits = allCommits.slice(nextIndex);
  if (unprocessedCommits.length === 0) {
    return { chunksCreated: 0, totalCommits: allCommits.length };
  }

  const chunks = buildChunks(unprocessedCommits, chunkSize, nextIndex);

  for (const c of chunks) {
    c.repositoryId = repoId;
  }

  const chunksCreated = await storeChunks(db, repoId, chunks);

  return { chunksCreated, totalCommits: allCommits.length };
}
