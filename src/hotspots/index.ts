import { PrismaClient } from "@prisma/client";

export interface HotspotFile {
  path: string;
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  churn: number;
  uniqueAuthors: number;
  riskScore: number;
}

export async function getHotspots(
  db: PrismaClient,
  repoId: string,
  options?: { limit?: number }
): Promise<HotspotFile[]> {
  const files = await db.file.findMany({
    where: { repositoryId: repoId },
    include: {
      commits: {
        include: { commit: true },
      },
    },
  });

  const hotspots: HotspotFile[] = files.map((f) => {
    const totalInsertions = f.commits.reduce((s, cf) => s + cf.insertions, 0);
    const totalDeletions = f.commits.reduce((s, cf) => s + cf.deletions, 0);
    const churn = totalInsertions + totalDeletions;
    const uniqueAuthors = new Set(f.commits.map((cf) => cf.commit.authorName)).size;

    const commitScore = Math.min(f.commits.length / 10, 1);
    const churnScore = Math.min(churn / 500, 1);
    const authorScore = uniqueAuthors > 3 ? 0.8 : uniqueAuthors > 1 ? 0.5 : 0.2;
    const riskScore = parseFloat(((commitScore * 0.4 + churnScore * 0.4 + authorScore * 0.2) * 100).toFixed(1));

    return {
      path: f.path,
      totalCommits: f.commits.length,
      totalInsertions,
      totalDeletions,
      churn,
      uniqueAuthors,
      riskScore,
    };
  });

  hotspots.sort((a, b) => b.riskScore - a.riskScore);
  return hotspots.slice(0, options?.limit ?? 20);
}
