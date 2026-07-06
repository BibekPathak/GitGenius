import { PrismaClient } from "@prisma/client";

export interface ReportData {
  repoName: string;
  generatedAt: string;
  totalCommits: number;
  totalFiles: number;
  totalAuthors: number;
  dateRange: { earliest: string; latest: string };
  commitsByAuthor: { author: string; count: number; insertions: number; deletions: number }[];
  commitsByMonth: { month: string; count: number }[];
  filesByChurn: { path: string; churn: number; commits: number }[];
  categoryBreakdown: { category: string; count: number }[];
  riskDistribution: { risk: string; count: number }[];
}

export async function collectReportData(
  db: PrismaClient,
  repoId: string
): Promise<ReportData> {
  const [repo, commits, files, chunks] = await Promise.all([
    db.repository.findUnique({ where: { id: repoId } }),
    db.commit.findMany({ where: { repositoryId: repoId }, orderBy: { authorDate: "asc" } }),
    db.file.findMany({
      where: { repositoryId: repoId },
      include: { commits: { select: { insertions: true, deletions: true, id: true } } },
    }),
    db.chunk.findMany({ where: { repositoryId: repoId, status: "ANALYZED" } }),
  ]);

  const authorMap = new Map<string, { count: number; insertions: number; deletions: number }>();
  for (const c of commits) {
    const key = c.authorName;
    const existing = authorMap.get(key) ?? { count: 0, insertions: 0, deletions: 0 };
    existing.count++;
    existing.insertions += c.insertions;
    existing.deletions += c.deletions;
    authorMap.set(key, existing);
  }

  const monthMap = new Map<string, number>();
  for (const c of commits) {
    const month = c.authorDate.toISOString().slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
  }

  const fileChurn = files.map((f) => {
    const churn = f.commits.reduce((s, cf) => s + cf.insertions + cf.deletions, 0);
    return { path: f.path, churn, commits: f.commits.length };
  });
  fileChurn.sort((a, b) => b.churn - a.churn);

  const categoryMap = new Map<string, number>();
  const riskMap = new Map<string, number>();
  for (const chunk of chunks) {
    const cat = chunk.keywords ? "analyzed" : "pending";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    const risk = chunk.risks ?? "unknown";
    riskMap.set(risk, (riskMap.get(risk) ?? 0) + 1);
  }

  return {
    repoName: repo?.name ?? "unknown",
    generatedAt: new Date().toISOString(),
    totalCommits: commits.length,
    totalFiles: files.length,
    totalAuthors: authorMap.size,
    dateRange: {
      earliest: commits[0]?.authorDate.toISOString().split("T")[0] ?? "—",
      latest: commits[commits.length - 1]?.authorDate.toISOString().split("T")[0] ?? "—",
    },
    commitsByAuthor: Array.from(authorMap.entries())
      .map(([author, d]) => ({ author, ...d }))
      .sort((a, b) => b.count - a.count),
    commitsByMonth: Array.from(monthMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    filesByChurn: fileChurn.slice(0, 20),
    categoryBreakdown: Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    riskDistribution: Array.from(riskMap.entries())
      .map(([risk, count]) => ({ risk, count })),
  };
}
