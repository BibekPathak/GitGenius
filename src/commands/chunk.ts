import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { chunkRepository } from "../analyzer/chunker.js";
import { spinner } from "../utils/spinner.js";

export interface ChunkOptions {
  size?: number;
}

export async function chunkCommand(dir?: string, options?: ChunkOptions): Promise<void> {
  const targetDir = dir ?? process.cwd();
  const chunkSize = options?.size ?? 50;

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

  sp.text = "Chunking commits...";

  try {
    const result = await chunkRepository(prisma, repo.id, chunkSize);

    if (result.chunksCreated === 0) {
      sp.succeed(chalk.green("No new chunks needed (all commits already chunked)"));
    } else {
      sp.succeed(chalk.green(`Created ${result.chunksCreated} chunk(s)`));
      console.log(`  ${chalk.dim("Chunks:")}     ${result.chunksCreated}`);
      console.log(`  ${chalk.dim("Commits:")}    ${result.totalCommits}`);
      console.log(`  ${chalk.dim("Chunk size:")} ${chunkSize}`);
      console.log();
      console.log(`  ${chalk.cyan("Next:")} ${chalk.bold("gitgenius analyze")} — run AI analysis on chunks`);
    }
  } catch (err) {
    sp.fail(chalk.red(`Chunking failed: ${err}`));
    throw err;
  } finally {
    await closePrisma();
  }
}
