import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { getHotspots } from "../hotspots/index.js";
import { spinner } from "../utils/spinner.js";

export async function hotspotsCommand(dir?: string): Promise<void> {
  const targetDir = dir ?? process.cwd();
  const sp = spinner("Analyzing hotspots...").start();

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

  const hotspots = await getHotspots(prisma, repo.id, { limit: 20 });
  await closePrisma();
  sp.stop();

  console.log(`\n${chalk.bold("Hotspot Files")}  (high churn + frequent changes = unstable)`);
  console.log();

  for (let i = 0; i < hotspots.length; i++) {
    const h = hotspots[i]!;
    const rank = String(i + 1).padEnd(3);
    const path = h.path.length > 42 ? "..." + h.path.slice(-39) : h.path.padEnd(42);
    const riskColor = h.riskScore >= 40 ? chalk.red : h.riskScore >= 20 ? chalk.yellow : chalk.green;
    const churnStr = `+${h.totalInsertions}/-${h.totalDeletions}`.padEnd(14);

    console.log(`  ${chalk.cyan(rank)} ${chalk.dim(path)} ${riskColor(String(h.riskScore).padEnd(6))} risk  ${churnStr} ${String(h.totalCommits).padEnd(4)} commits  ${h.uniqueAuthors} devs`);
  }
}
