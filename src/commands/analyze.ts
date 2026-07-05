import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { createJob, updateJob } from "../db/queries.js";
import { createGeminiProvider } from "../ai/gemini.js";
import type { AIProvider, ChunkData, AnalyzeResult, ChunkAnalysis } from "../ai/types.js";
import { spinner } from "../utils/spinner.js";

export interface AnalyzeOptions {
  retry?: boolean;
  model?: string;
}

export async function analyzeCommand(
  dir?: string,
  options?: AnalyzeOptions & { provider?: AIProvider }
): Promise<void> {
  const targetDir = dir ?? process.cwd();

  const sp = spinner("Preparing...").start();

  let repoRoot: string;
  try {
    repoRoot = findRepoRoot(targetDir);
  } catch (e) {
    if (e instanceof NotAGitRepoError) {
      sp.fail(chalk.red(`Not a git repository: ${targetDir}`));
      throw e;
    }
    throw e;
  }

  const db = dbPath(repoRoot);
  if (!existsSync(db)) {
    sp.fail(chalk.red("GitGenius not initialized. Run: gitgenius init"));
    throw new Error("GitGenius not initialized");
  }

  const prisma = getPrisma(db);
  const config = JSON.parse(await readFile(configPath(repoRoot), "utf-8"));
  const repo = await getRepository(prisma, repoRoot);

  if (!repo) {
    sp.fail(chalk.red("Repository not found. Run: gitgenius init"));
    await closePrisma();
    throw new Error("Repository not found");
  }

  // Find chunks to analyze
  const chunkStatusFilter = options?.retry ? ["PENDING", "FAILED"] : ["PENDING"];
  const chunks = await prisma.chunk.findMany({
    where: { repositoryId: repo.id, status: { in: chunkStatusFilter } },
    orderBy: { startIndex: "asc" },
  });

  if (chunks.length === 0) {
    sp.succeed(chalk.green("No chunks to analyze"));
    await closePrisma();
    return;
  }

  sp.text = `Analyzing ${chunks.length} chunk(s) with Gemini...`;

  let provider: AIProvider;
  if (options?.provider) {
    provider = options.provider;
  } else {
    try {
      provider = createGeminiProvider(options?.model);
    } catch (e) {
      sp.fail(chalk.red(`AI provider error: ${e}`));
      await closePrisma();
      throw e;
    }
  }

  const job = await createJob(prisma, repo.id, "ANALYZE");
  await updateJob(prisma, job.id, {
    status: "RUNNING",
    totalItems: chunks.length,
    startedAt: new Date(),
  });

  const results: AnalyzeResult[] = [];
  let processed = 0;
  let failed = 0;

  for (const chunk of chunks) {
    // Load commits for this chunk
    const chunkCommits = await prisma.chunkCommit.findMany({
      where: { chunkId: chunk.id },
      include: {
        commit: {
          include: {
            files: {
              include: { file: true },
            },
          },
        },
      },
    });

    // Build chunk data for the prompt
    const commitData = chunkCommits.map((cc) => ({
      hash: cc.commit.hash,
      message: cc.commit.message,
      authorName: cc.commit.authorName,
      authorDate: cc.commit.authorDate.toISOString().split("T")[0]!,
      insertions: cc.commit.insertions,
      deletions: cc.commit.deletions,
      files: cc.commit.files.map((cf) => cf.file.path),
    }));

    const chunkData: ChunkData = {
      id: chunk.id,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
      repository: repo.name,
      commits: commitData,
    };

    sp.text = `Analyzing chunk ${chunk.startIndex + 1}-${chunk.endIndex + 1} (${commitData.length} commits)...`;

    try {
      const analysis = await provider.analyze(chunkData);

      await prisma.chunk.update({
        where: { id: chunk.id },
        data: {
          summary: analysis.summary,
          topics: JSON.stringify(analysis.keywords),
          keywords: JSON.stringify(analysis.keywords),
          risks: analysis.risk,
          status: "ANALYZED",
        },
      });

      results.push({ chunkId: chunk.id, analysis, success: true });
      processed++;
    } catch (err) {
      await prisma.chunk.update({
        where: { id: chunk.id },
        data: { status: "FAILED" },
      });

      results.push({
        chunkId: chunk.id,
        analysis: { summary: "", category: "", risk: "", keywords: [], confidence: 0 },
        success: false,
        error: String(err),
      });
      failed++;
    }
  }

  await updateJob(prisma, job.id, {
    status: failed > 0 ? "FAILED" : "SUCCESS",
    processedItems: processed,
    failedItems: failed,
    completedAt: new Date(),
  });

  await closePrisma();

  if (failed > 0) {
    sp.warn(chalk.yellow(`Analyzed ${processed} chunk(s), ${failed} failed`));
    console.log(`  ${chalk.dim("Failed chunks:")} ${results.filter((r) => !r.success).map((r) => r.chunkId.slice(0, 8)).join(", ")}`);
    console.log(`  ${chalk.cyan("Retry:")} ${chalk.bold("gitgenius analyze --retry")}`);
  } else {
    sp.succeed(chalk.green(`Analyzed ${processed} chunk(s)`));
    console.log(`  ${chalk.cyan("Next:")} ${chalk.bold("gitgenius embed")} — generate embeddings`);
  }
}
