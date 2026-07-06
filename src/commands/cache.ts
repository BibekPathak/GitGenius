import chalk from "chalk";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { cacheDir } from "../utils/paths.js";
import { FileCache } from "../cache/index.js";
import { spinner } from "../utils/spinner.js";

export async function cacheCommand(action: string, dir?: string): Promise<void> {
  const targetDir = dir ?? process.cwd();
  const sp = spinner("Checking cache...").start();

  let repoRoot: string;
  try { repoRoot = findRepoRoot(targetDir); }
  catch (e) {
    if (e instanceof NotAGitRepoError) { sp.fail(chalk.red("Not a git repository")); throw e; }
    throw e;
  }

  const cache = new FileCache(cacheDir(repoRoot));

  if (action === "clear") {
    const stats = cache.stats();
    const cleared = cache.clearAll();
    sp.succeed(chalk.green(`Cleared ${cleared} cached entries (was ${stats.sizeKB} KB)`));
  } else if (action === "stats") {
    const stats = cache.stats();
    sp.stop();
    console.log(`\n${chalk.bold("Cache Statistics")}`);
    console.log(`  ${chalk.dim("Entries:")} ${stats.entries}`);
    console.log(`  ${chalk.dim("Size:")}    ${stats.sizeKB} KB`);
    console.log(`  ${chalk.dim("Dir:")}    ${cacheDir(repoRoot)}`);
  }
}
