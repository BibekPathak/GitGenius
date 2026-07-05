import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository, createJob, updateJob } from "../db/queries.js";
import { createGeminiEmbedder } from "../embeddings/gemini.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { spinner } from "../utils/spinner.js";

export interface EmbedOptions {
  model?: string;
  provider?: EmbeddingProvider;
}

function buildEmbeddingText(
  summary: string,
  keywords: string[],
  commitMessages: string[]
): string {
  const parts = [summary, ...keywords, ...commitMessages];
  return parts.filter(Boolean).join("\n");
}

export async function embedCommand(
  dir?: string,
  options?: EmbedOptions
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

  // Find analyzed chunks without embeddings
  const chunks = await prisma.chunk.findMany({
    where: {
      repositoryId: repo.id,
      status: "ANALYZED",
      embeddings: { none: {} },
    },
    orderBy: { startIndex: "asc" },
    include: {
      commits: {
        include: { commit: { select: { message: true } } },
      },
    },
  });

  if (chunks.length === 0) {
    sp.succeed(chalk.green("No chunks to embed"));
    await closePrisma();
    return;
  }

  let embedder: EmbeddingProvider;
  if (options?.provider) {
    embedder = options.provider;
  } else {
    try {
      embedder = createGeminiEmbedder(options?.model);
    } catch (e) {
      sp.fail(chalk.red(`Embedding provider error: ${e}`));
      await closePrisma();
      throw e;
    }
  }

  sp.text = `Generating embeddings for ${chunks.length} chunk(s)...`;

  const job = await createJob(prisma, repo.id, "EMBED");
  await updateJob(prisma, job.id, {
    status: "RUNNING",
    totalItems: chunks.length,
    startedAt: new Date(),
  });

  let processed = 0;
  let failed = 0;

  for (const chunk of chunks) {
    sp.text = `Embedding chunk ${chunk.startIndex + 1}-${chunk.endIndex + 1}...`;

    try {
      const keywords: string[] = chunk.keywords
        ? (JSON.parse(chunk.keywords) as string[])
        : [];
      const commitMessages = chunk.commits.map((cc) => cc.commit.message);
      const text = buildEmbeddingText(
        chunk.summary ?? "",
        keywords,
        commitMessages
      );

      const result = await embedder.embed(text);

      await prisma.embedding.create({
        data: {
          model: embedder.name,
          vector: JSON.stringify(result.vector),
          dimension: result.dimension,
          sourceType: "chunk",
          sourceId: chunk.id,
          content: text.slice(0, 500),
          repositoryId: repo.id,
          chunkId: chunk.id,
        },
      });

      processed++;
    } catch (err) {
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
    sp.warn(chalk.yellow(`Embedded ${processed} chunk(s), ${failed} failed`));
  } else {
    sp.succeed(chalk.green(`Embedded ${processed} chunk(s)`));
    console.log(`  ${chalk.dim("Embedder:")} ${embedder.name}`);
    console.log(`  ${chalk.cyan("Next:")} ${chalk.bold("gitgenius search")} — search with embeddings`);
  }
}
