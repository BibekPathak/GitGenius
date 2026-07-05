import { PrismaClient } from "@prisma/client";
import type { ParsedCommit, ParsedFile } from "../types/index.js";
import { chunkArray } from "../utils/batch.js";

export async function getRepository(db: PrismaClient, path: string) {
  return db.repository.findUnique({ where: { path } });
}

export async function createRepository(
  db: PrismaClient,
  data: {
    path: string;
    name: string;
    defaultBranch?: string;
    headCommit?: string;
    gitVersion?: string;
  }
) {
  return db.repository.create({ data });
}

export async function getIndexedHashes(
  db: PrismaClient,
  repoId: string
): Promise<Set<string>> {
  const rows = await db.commit.findMany({
    where: { repositoryId: repoId },
    select: { hash: true },
  });
  return new Set(rows.map((r) => r.hash));
}

export async function getHeadCommit(repoId: string): Promise<string | null> {
  return null; // stub for now
}

export interface CommitInsert {
  hash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorDate: Date;
  insertions: number;
  deletions: number;
  parentHashes: string;
  status: string;
  repositoryId: string;
}

export interface FileInsert {
  path: string;
  repositoryId: string;
}

export interface CommitFileInsert {
  commitId: string;
  fileId: string;
  status: string;
  insertions: number;
  deletions: number;
}

export function prepareCommitInserts(
  repoId: string,
  commits: ParsedCommit[]
): {
  commits: CommitInsert[];
  files: FileInsert[];
  commitFiles: CommitFileInsert[];
  filePathToId: Map<string, string>;
} {
  const filePathToId = new Map<string, string>();
  const files: FileInsert[] = [];
  const commitInserts: CommitInsert[] = [];
  const commitFileInserts: CommitFileInsert[] = [];
  let fileCounter = 0;

  for (const c of commits) {
    commitInserts.push({
      hash: c.hash,
      message: c.message,
      authorName: c.authorName,
      authorEmail: c.authorEmail,
      authorDate: c.authorDate,
      insertions: c.insertions,
      deletions: c.deletions,
      parentHashes: JSON.stringify(c.parentHashes),
      status: "INDEXED",
      repositoryId: repoId,
    });

    for (const f of c.files) {
      if (!filePathToId.has(f.path)) {
        fileCounter++;
        const fid = `file_${fileCounter}`;
        filePathToId.set(f.path, fid);
        files.push({ path: f.path, repositoryId: repoId });
      }
    }
  }

  return { commits: commitInserts, files, commitFiles: commitFileInserts, filePathToId };
}

export async function upsertFiles(
  db: PrismaClient,
  files: FileInsert[],
  repoId: string
): Promise<Map<string, string>> {
  const pathToId = new Map<string, string>();

  for (const f of files) {
    const existing = await db.file.findUnique({
      where: { path_repositoryId: { path: f.path, repositoryId: repoId } },
    });
    if (existing) {
      pathToId.set(f.path, existing.id);
    } else {
      const created = await db.file.create({ data: f });
      pathToId.set(f.path, created.id);
    }
  }

  return pathToId;
}

export async function insertCommitsBatch(
  db: PrismaClient,
  repoId: string,
  commits: ParsedCommit[]
): Promise<void> {
  const batches = chunkArray(commits, 100);

  for (const batch of batches) {
    const { files, commitFiles } = prepareCommitInserts(repoId, batch);

    await db.$transaction(async (tx) => {
      const pathToId = new Map<string, string>();

      for (const f of files) {
        const existing = await tx.file.findUnique({
          where: { path_repositoryId: { path: f.path, repositoryId: repoId } },
        });
        if (existing) {
          pathToId.set(f.path, existing.id);
        } else {
          const created = await tx.file.create({ data: f });
          pathToId.set(f.path, created.id);
        }
      }

      for (const c of batch) {
        const created = await tx.commit.create({
          data: {
            hash: c.hash,
            message: c.message,
            authorName: c.authorName,
            authorEmail: c.authorEmail,
            authorDate: c.authorDate,
            insertions: c.insertions,
            deletions: c.deletions,
            parentHashes: JSON.stringify(c.parentHashes),
            status: "INDEXED",
            repositoryId: repoId,
          },
        });

        for (const f of c.files) {
          const fileId = pathToId.get(f.path);
          if (!fileId) continue;

          await tx.commitFile.create({
            data: {
              commitId: created.id,
              fileId,
              status: f.status,
              insertions: f.insertions,
              deletions: f.deletions,
            },
          });
        }
      }
    });
  }
}

export async function updateRepositoryMetadata(
  db: PrismaClient,
  repoId: string,
  data: {
    headCommit?: string;
    lastIndexedCommit?: string;
    lastIndexedAt?: Date;
  }
): Promise<void> {
  await db.repository.update({
    where: { id: repoId },
    data,
  });
}

export async function createJob(
  db: PrismaClient,
  repoId: string,
  type: string
) {
  return db.job.create({
    data: {
      type,
      status: "PENDING",
      repositoryId: repoId,
    },
  });
}

export async function updateJob(
  db: PrismaClient,
  jobId: string,
  data: {
    status?: string;
    totalItems?: number;
    processedItems?: number;
    failedItems?: number;
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data,
  });
}
