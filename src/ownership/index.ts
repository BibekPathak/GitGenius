import { PrismaClient } from "@prisma/client";

export interface DeveloperStats {
  authorName: string;
  authorEmail: string;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  filesChanged: number;
  firstCommit: Date | null;
  lastCommit: Date | null;
}

export interface FileOwner {
  path: string;
  owner: string;
  ownershipPct: number;
  totalCommits: number;
  ownerCommits: number;
}

export async function getDeveloperStats(
  db: PrismaClient,
  repoId: string
): Promise<DeveloperStats[]> {
  const commits = await db.commit.findMany({
    where: { repositoryId: repoId },
    include: {
      files: true,
    },
  });

  const devMap = new Map<string, DeveloperStats>();

  for (const c of commits) {
    const key = c.authorEmail ?? c.authorName;
    const existing = devMap.get(key);
    if (existing) {
      existing.totalCommits++;
      existing.totalInsertions += c.insertions;
      existing.totalDeletions += c.deletions;
      existing.filesChanged += c.files.length;
      if (!existing.firstCommit || c.authorDate < existing.firstCommit) {
        existing.firstCommit = c.authorDate;
      }
      if (!existing.lastCommit || c.authorDate > existing.lastCommit) {
        existing.lastCommit = c.authorDate;
      }
    } else {
      devMap.set(key, {
        authorName: c.authorName,
        authorEmail: c.authorEmail ?? "",
        totalCommits: 1,
        totalInsertions: c.insertions,
        totalDeletions: c.deletions,
        filesChanged: c.files.length,
        firstCommit: c.authorDate,
        lastCommit: c.authorDate,
      });
    }
  }

  return Array.from(devMap.values()).sort(
    (a, b) => b.totalCommits - a.totalCommits
  );
}

export async function getFileOwners(
  db: PrismaClient,
  repoId: string
): Promise<FileOwner[]> {
  const files = await db.file.findMany({
    where: { repositoryId: repoId },
    include: {
      commits: {
        include: { commit: true },
      },
    },
  });

  const results: FileOwner[] = [];

  for (const file of files) {
    if (file.commits.length === 0) continue;

    const authorCounts = new Map<string, number>();
    for (const cf of file.commits) {
      const key = cf.commit.authorEmail ?? cf.commit.authorName;
      authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
    }

    let topAuthor = "";
    let topCount = 0;
    for (const [author, count] of authorCounts) {
      if (count > topCount) {
        topCount = count;
        topAuthor = author;
      }
    }

    results.push({
      path: file.path,
      owner: topAuthor,
      ownershipPct: Math.round((topCount / file.commits.length) * 100),
      totalCommits: file.commits.length,
      ownerCommits: topCount,
    });
  }

  results.sort((a, b) => b.totalCommits - a.totalCommits);
  return results;
}

export function computeBusFactor(
  devStats: DeveloperStats[]
): { busFactor: number; totalDevs: number; topContributors: string[] } {
  if (devStats.length === 0) return { busFactor: 0, totalDevs: 0, topContributors: [] };

  const totalCommits = devStats.reduce((s, d) => s + d.totalCommits, 0);
  let cumulative = 0;
  let busFactor = 0;
  const topContributors: string[] = [];

  for (const dev of devStats) {
    cumulative += dev.totalCommits;
    topContributors.push(dev.authorName);
    busFactor++;
    if (cumulative / totalCommits >= 0.5) break;
  }

  return { busFactor, totalDevs: devStats.length, topContributors };
}
