import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChunkAnalysis } from "../ai/types.js";

export interface ReleaseNote {
  version: string;
  previousVersion: string;
  date: string;
  summary: string;
  categories: Record<string, string[]>;
  commits: { hash: string; message: string; author: string; category: string }[];
}

function getApiKey(): string {
  return process.env.GEMINI_API_KEY ?? "";
}

export async function generateReleaseNotes(
  db: PrismaClient,
  repoId: string,
  fromRef: string,
  toRef: string,
  repoName: string
): Promise<ReleaseNote> {
  const toCommit = await db.commit.findFirst({
    where: { repositoryId: repoId, hash: { startsWith: toRef.length >= 7 ? toRef : "" } },
    orderBy: { authorDate: "desc" },
  });

  if (!toCommit) {
    throw new Error(`Commit not found for ref: ${toRef}`);
  }

  const commits = await db.commit.findMany({
    where: { repositoryId: repoId },
    orderBy: { authorDate: "asc" },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      files: { include: { file: true } },
    },
  });

  const fromIdx = fromRef
    ? commits.findIndex((c) => c.hash.startsWith(fromRef.length >= 7 ? fromRef : ""))
    : 0;
  const toIdx = commits.findIndex((c) => c.id === toCommit.id);

  if (fromIdx === -1 && fromRef) {
    throw new Error(`Commit not found for ref: ${fromRef}`);
  }

  const range = commits.slice(fromIdx === -1 ? 0 : fromIdx, toIdx + 1);

  const categoryMap: Record<string, string[]> = {
    Features: [],
    "Bug Fixes": [],
    Performance: [],
    Security: [],
    Refactoring: [],
    Infrastructure: [],
    Documentation: [],
    Other: [],
  };

  const mapped: ReleaseNote["commits"] = [];

  for (const c of range) {
    const analysis = c.analyses[0];
    const rawCategory = analysis?.category ?? "other";
    let category = "Other";
    for (const [cat, _] of Object.entries(categoryMap)) {
      if (rawCategory.toLowerCase().includes(cat.toLowerCase().slice(0, 3))) {
        category = cat;
        break;
      }
    }

    const msg = c.message.split("\n")[0] ?? c.message;
    categoryMap[category]!.push(msg);
    mapped.push({ hash: c.hash, message: msg, author: c.authorName, category });
  }

  const apiKey = getApiKey();
  let summary = `Release ${toRef} with ${range.length} commits since ${fromRef || "the beginning"}.`;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const commitSummaries = mapped.map((c) => `  - ${c.hash.slice(0, 7)} ${c.message}`).join("\n");
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: `Summarize this release in 2-3 sentences:\n${commitSummaries}\n\nFocus on user-facing changes.` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      });
      summary = result.response.text().trim();
    } catch { /* fallback to default summary */ }
  }

  return {
    version: toRef,
    previousVersion: fromRef || "(initial)",
    date: toCommit.authorDate.toISOString().split("T")[0]!,
    summary,
    categories: Object.fromEntries(Object.entries(categoryMap).filter(([_, v]) => v.length > 0)),
    commits: mapped,
  };
}
