import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { createJob, updateJob } from "../db/queries.js";
import { createGeminiProvider } from "../ai/gemini.js";
import { createOpenAIProvider } from "../ai/openai.js";
import type { AIProvider, ChunkData, AnalyzeResult, ChunkAnalysis } from "../ai/types.js";
import type { AIProviderName } from "../ai/types.js";
import { FileCache } from "../cache/index.js";
import { cacheDir } from "../utils/paths.js";
import { spinner } from "../utils/spinner.js";

const DEFAULT_RATE_LIMIT_DELAY_MS = 1500;

export interface AnalyzeOptions {
  retry?: boolean;
  model?: string;
  delay?: number;
  providerName?: AIProviderName;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function analyzeCommand(
  dir?: string,
  options?: AnalyzeOptions & { provider?: AIProvider }
): Promise<void> {
  const targetDir = dir ?? process.cwd();
  const delayMs = options?.delay ?? DEFAULT_RATE_LIMIT_DELAY_MS;

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

  sp.text = `Analyzing ${chunks.length} chunk(s) (${options?.providerName ?? "gemini"}, ${delayMs}ms delay)...`;

  let provider: AIProvider;
  if (options?.provider) {
    provider = options.provider;
  } else {
    const providerName = options?.providerName ?? "gemini";
    try {
      switch (providerName) {
        case "openai":
          provider = createOpenAIProvider(options?.model);
          break;
        case "gemini":
        default:
          provider = createGeminiProvider(options?.model);
          break;
      }
    } catch (e) {
      sp.fail(chalk.red(`${providerName} provider error: ${e}`));
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
  let firstErrorShown = false;

  const cache = new FileCache(cacheDir(repoRoot));

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

    sp.text = `Analyzing chunk ${chunk.startIndex + 1}-${chunk.endIndex + 1} (${commitData.length} commits, ${processed + 1}/${chunks.length})...`;

    try {
      const cacheKey = "analyze:" + cache.contentHash(JSON.stringify(chunkData));
      const analysis = await cache.getOrSetAsync(
        cacheKey,
        async () => {
          const result = await provider.analyze(chunkData);
          await sleep(delayMs);
          return result;
        },
        7 * 24 * 60 * 60 * 1000
      );

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

      if (!firstErrorShown) {
        firstErrorShown = true;
        sp.fail(chalk.red(`Chunk ${chunk.startIndex + 1} failed: ${err}`));
        // Re-start spinner for remaining
        sp.text = `Continuing with remaining chunks...`;
        sp.start();
      }

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

  const firstErr = results.find((r) => !r.success);
  console.log();

  if (failed > 0) {
    sp.warn(chalk.yellow(`Analyzed ${processed} chunk(s), ${failed} failed`));
    console.log(`  ${chalk.dim("Failed:")}     ${failed}/${chunks.length} chunks`);
    console.log(`  ${chalk.dim("First error:")} ${firstErr?.error?.slice(0, 120)}`);
    console.log(`  ${chalk.cyan("Options:")}`);
    console.log(`    ${chalk.bold("gitgenius analyze --retry")}     retry failed chunks`);
    console.log(`    ${chalk.bold("gitgenius analyze --delay 3000")} increase delay (ms) between API calls`);
    console.log(`    ${chalk.bold("gitgenius analyze --retry --delay 3000")} retry with 3s delay`);
  } else {
    sp.succeed(chalk.green(`Analyzed ${processed} chunk(s)`));
    console.log(`  ${chalk.cyan("Next:")} ${chalk.bold("gitgenius embed")} — generate embeddings`);
  }
}
