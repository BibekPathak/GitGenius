import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { createGeminiEmbedder } from "../embeddings/gemini.js";
import { createMockEmbedder } from "../embeddings/mock.js";
import type { EmbeddingProvider } from "../embeddings/types.js";
import { search } from "../search/index.js";
import { FileCache } from "../cache/index.js";
import { cacheDir } from "../utils/paths.js";
import { spinner } from "../utils/spinner.js";

export interface SearchOptions {
  limit?: number;
  provider?: EmbeddingProvider;
  bm25Weight?: number;
  vectorWeight?: number;
}

export async function searchCommand(
  query: string,
  dir?: string,
  options?: SearchOptions
): Promise<void> {
  if (!query) {
    console.log(chalk.yellow("Usage: gitgenius search <query>"));
    return;
  }

  const targetDir = dir ?? process.cwd();

  const sp = spinner("Searching...").start();

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
    sp.fail(chalk.red("Repository not found"));
    await closePrisma();
    throw new Error("Repository not found");
  }

  let embedder: EmbeddingProvider;
  if (options?.provider) {
    embedder = options.provider;
  } else {
    try {
      embedder = createGeminiEmbedder();
    } catch {
      embedder = createMockEmbedder(4);
    }
  }

  const limit = options?.limit ?? 10;
  const cache = new FileCache(cacheDir(repoRoot));

  try {
    const cacheKey = "search:" + cache.contentHash(query);
    const results = await cache.getOrSetAsync(
      cacheKey,
      () => search(prisma, repo.id, query, embedder, {
        limit,
        bm25Weight: options?.bm25Weight ?? 0.4,
        vectorWeight: options?.vectorWeight ?? 0.6,
      }),
      5 * 60 * 1000 // 5 min TTL
    );

    await closePrisma();

    if (results.length === 0) {
      sp.info(chalk.dim("No results found"));
      return;
    }

    sp.stop();

    console.log(`\n${chalk.bold(`Top ${results.length} results for "${query}"`)}`);
    console.log();

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const rank = i + 1;
      const scorePct = (r.score * 100).toFixed(0);

      console.log(
        `  ${chalk.cyan(`#${rank}`)} ${chalk.bold(r.summary.slice(0, 80))}`
      );
      console.log(`     ${chalk.dim(`Score: ${scorePct}%`)}`);
      console.log(`     ${chalk.dim(`Commits: ${r.commitCount} (${r.startIndex + 1}-${r.endIndex + 1})`)}`);
      if (r.keywords.length > 0) {
        console.log(`     ${chalk.dim(`Keywords: ${r.keywords.slice(0, 5).join(", ")}`)}`);
      }

      // Show top 3 commits
      for (const c of r.commits.slice(0, 3)) {
        console.log(`     ${chalk.gray(c.hash.slice(0, 7))} ${c.message.slice(0, 70)}`);
      }
      console.log();
    }
  } catch (err) {
    sp.fail(chalk.red(`Search failed: ${err}`));
    await closePrisma();
    throw err;
  }
}
