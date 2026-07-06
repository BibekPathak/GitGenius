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
import { ask } from "../rag/pipeline.js";
import { spinner } from "../utils/spinner.js";

export interface AskOptions {
  model?: string;
  provider?: EmbeddingProvider;
}

export async function askCommand(
  question: string,
  dir?: string,
  options?: AskOptions
): Promise<void> {
  if (!question) {
    console.log(chalk.yellow("Usage: gitgenius ask <question>"));
    console.log(chalk.dim("Examples:"));
    console.log(chalk.dim('  gitgenius ask "When was JWT authentication added?"'));
    console.log(chalk.dim('  gitgenius ask "Who worked on the payment system?"'));
    console.log(chalk.dim('  gitgenius ask "Why was Redis introduced?"'));
    return;
  }

  const targetDir = dir ?? process.cwd();

  const sp = spinner("Thinking...").start();

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
      embedder = createMockEmbedder(128);
    }
  }

  try {
    const result = await ask(prisma, repo.id, repo.name, question, embedder, {
      model: options?.model,
    });

    await closePrisma();

    sp.stop();

    console.log(`\n${chalk.bold("Answer:")}\n`);
    console.log(`  ${result.answer}`);

    if (result.sources.length > 0) {
      console.log(`\n${chalk.dim("Sources:")}`);
      for (const source of result.sources.slice(0, 3)) {
        const commits = source.commits.slice(0, 2);
        for (const c of commits) {
          console.log(chalk.dim(`  ${c.hash.slice(0, 7)} ${c.message.slice(0, 70)}`));
        }
      }
    }
  } catch (err) {
    sp.fail(chalk.red(`Failed: ${err}`));
    await closePrisma();
    throw err;
  }
}
