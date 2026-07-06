import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { getDeveloperStats, getFileOwners, computeBusFactor } from "../ownership/index.js";
import { spinner } from "../utils/spinner.js";

export async function ownershipCommand(dir?: string): Promise<void> {
  const targetDir = dir ?? process.cwd();
  const sp = spinner("Analyzing...").start();

  let repoRoot: string;
  try {
    repoRoot = findRepoRoot(targetDir);
  } catch (e) {
    if (e instanceof NotAGitRepoError) { sp.fail(chalk.red(`Not a git repository: ${targetDir}`)); throw e; }
    throw e;
  }

  const db = dbPath(repoRoot);
  if (!existsSync(db)) { sp.fail(chalk.red("Not initialized")); throw new Error("Not initialized"); }

  const prisma = getPrisma(db);
  const repo = await getRepository(prisma, repoRoot);
  if (!repo) { sp.fail(chalk.red("Repo not found")); await closePrisma(); throw new Error("Not found"); }

  const [devs, fileOwners] = await Promise.all([
    getDeveloperStats(prisma, repo.id),
    getFileOwners(prisma, repo.id),
  ]);

  await closePrisma();
  sp.stop();

  console.log(`\n${chalk.bold("Developers")}`);
  for (const d of devs) {
    console.log(`  ${chalk.cyan(d.authorName.padEnd(16))} ${String(d.totalCommits).padEnd(5)} commits  +${d.totalInsertions}/-${d.totalDeletions}  ${d.filesChanged} files`);
  }

  const bus = computeBusFactor(devs);
  console.log(`\n${chalk.bold("Bus Factor")}  ${chalk.yellow(bus.busFactor)}/${bus.totalDevs} developers cover 50% of commits`);
  if (bus.busFactor <= 2) console.log(chalk.red("  ⚠ High risk — too few contributors"));

  console.log(`\n${chalk.bold("File Ownership")}`);
  for (const f of fileOwners.slice(0, 10)) {
    console.log(`  ${chalk.dim(f.path.padEnd(45))} ${f.owner.padEnd(16)} ${f.ownershipPct}% (${f.ownerCommits}/${f.totalCommits})`);
  }
}
