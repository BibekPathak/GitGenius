import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { getFileTimeline, listFiles } from "../evolution/fileTimeline.js";
import { spinner } from "../utils/spinner.js";

export interface EvolutionOptions {
  file?: string;
  sort?: "commits" | "churn";
  limit?: number;
}

export async function evolutionCommand(
  dir?: string,
  options?: EvolutionOptions
): Promise<void> {
  const targetDir = dir ?? process.cwd();

  const sp = spinner("Loading...").start();

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

  if (options?.file) {
    // Show timeline for a specific file
    const timeline = await getFileTimeline(prisma, repo.id, options.file);
    await closePrisma();

    if (!timeline) {
      sp.fail(chalk.red(`File not found: ${options.file}`));
      return;
    }

    sp.stop();

    console.log(`\n${chalk.bold(timeline.path)}`);
    console.log(`  ${chalk.dim("Created:")}  ${timeline.createdAt?.toISOString().split("T")[0]} by ${timeline.createdBy}`);
    console.log(`  ${chalk.dim("Commits:")}  ${timeline.totalCommits}`);
    console.log(`  ${chalk.dim("Churn:")}    +${timeline.totalInsertions} / -${timeline.totalDeletions}`);
    console.log(`  ${chalk.dim("Deleted:")}  ${timeline.isDeleted ? "Yes" : "No"}`);
    console.log();

    for (const event of timeline.events) {
      const date = event.authorDate.toISOString().split("T")[0];
      const diff = event.status === "added" ? chalk.green("+new") :
        event.insertions > 0 || event.deletions > 0 ?
          `${chalk.green(`+${event.insertions}`)} ${chalk.red(`-${event.deletions}`)}` :
          chalk.dim("(meta)");
      console.log(`  ${chalk.gray(event.hash.slice(0, 7))} ${chalk.dim(date)} ${event.authorName.padEnd(12)} ${diff}  ${event.message.slice(0, 60)}`);
    }
  } else {
    // List all files sorted by activity
    const sortBy = options?.sort ?? "commits";
    const files = await listFiles(prisma, repo.id, { sortBy, limit: options?.limit });
    await closePrisma();

    sp.stop();

    const sortLabel = sortBy === "churn" ? "churn (insertions+deletions)" : "commit count";
    console.log(`\n${chalk.bold(`Top files by ${sortLabel}`)}`);
    console.log();

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const rank = String(i + 1).padEnd(3);
      const path = f.path.length > 50 ? "..." + f.path.slice(-47) : f.path.padEnd(50);
      const churn = `+${f.totalInsertions}/-${f.totalDeletions}`.padEnd(14);
      const commits = String(f.totalCommits).padEnd(6);
      const date = f.lastModifiedAt ? f.lastModifiedAt.toISOString().split("T")[0] : "—";
      console.log(`  ${chalk.cyan(rank)} ${chalk.dim(path)} ${commits}commits ${churn} ${chalk.gray(date)}`);
    }
    console.log();
    console.log(chalk.cyan("Tip:"), chalk.dim('gitgenius file <path> to see file timeline'));
  }
}
