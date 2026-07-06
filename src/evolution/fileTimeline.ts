import { PrismaClient } from "@prisma/client";

export interface FileEvent {
  hash: string;
  authorName: string;
  authorDate: Date;
  message: string;
  status: string;
  insertions: number;
  deletions: number;
}

export interface FileTimeline {
  path: string;
  createdAt: Date | null;
  createdBy: string;
  lastModifiedAt: Date | null;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  isDeleted: boolean;
  events: FileEvent[];
}

export async function getFileTimeline(
  db: PrismaClient,
  repoId: string,
  filePath: string
): Promise<FileTimeline | null> {
  const file = await db.file.findUnique({
    where: { path_repositoryId: { path: filePath, repositoryId: repoId } },
    include: {
      commits: {
        include: {
          commit: true,
        },
        orderBy: { commit: { authorDate: "asc" } },
      },
    },
  });

  if (!file) return null;

  const events: FileEvent[] = file.commits.map((cf) => ({
    hash: cf.commit.hash,
    authorName: cf.commit.authorName,
    authorDate: cf.commit.authorDate,
    message: cf.commit.message,
    status: cf.status,
    insertions: cf.insertions,
    deletions: cf.deletions,
  }));

  const totalInsertions = events.reduce((s, e) => s + e.insertions, 0);
  const totalDeletions = events.reduce((s, e) => s + e.deletions, 0);

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  return {
    path: file.path,
    createdAt: firstEvent?.authorDate ?? null,
    createdBy: firstEvent?.authorName ?? "",
    lastModifiedAt: lastEvent?.authorDate ?? null,
    totalCommits: events.length,
    totalInsertions,
    totalDeletions,
    isDeleted: lastEvent?.status === "deleted",
    events,
  };
}

export interface FileSummary {
  path: string;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  lastModifiedAt: Date | null;
  authors: string[];
}

export async function listFiles(
  db: PrismaClient,
  repoId: string,
  options?: { sortBy?: "commits" | "churn"; limit?: number }
): Promise<FileSummary[]> {
  const files = await db.file.findMany({
    where: { repositoryId: repoId },
    include: {
      commits: {
        include: { commit: true },
      },
    },
  });

  const summaries: FileSummary[] = files.map((f) => {
    const authors = [...new Set(f.commits.map((cf) => cf.commit.authorName))];
    const totalInsertions = f.commits.reduce((s, cf) => s + cf.insertions, 0);
    const totalDeletions = f.commits.reduce((s, cf) => s + cf.deletions, 0);
    const lastEvent = f.commits[f.commits.length - 1];

    return {
      path: f.path,
      totalCommits: f.commits.length,
      totalInsertions,
      totalDeletions,
      lastModifiedAt: lastEvent?.commit.authorDate ?? null,
      authors,
    };
  });

  const sortBy = options?.sortBy ?? "commits";
  if (sortBy === "churn") {
    summaries.sort((a, b) => (b.totalInsertions + b.totalDeletions) - (a.totalInsertions + a.totalDeletions));
  } else {
    summaries.sort((a, b) => b.totalCommits - a.totalCommits);
  }

  return summaries.slice(0, options?.limit ?? 50);
}
