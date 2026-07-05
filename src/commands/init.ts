import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { gitGeniusDir, dbPath, configPath, GITGENIUS_SUBDIRS } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { createRepository } from "../db/queries.js";
import { GitParser } from "../parser/gitParser.js";
import { spinner } from "../utils/spinner.js";

export async function initCommand(dir?: string): Promise<void> {
  const targetDir = dir ?? process.cwd();

  const sp = spinner("Checking repository...").start();

  let repoRoot: string;
  try {
    repoRoot = findRepoRoot(targetDir);
  } catch (e) {
    sp.fail(chalk.red(`Not a git repository: ${targetDir}`));
    throw e;
  }

  sp.text = "Creating .gitgenius directory...";

  const ggDir = gitGeniusDir(repoRoot);
  if (!existsSync(ggDir)) {
    mkdirSync(ggDir, { recursive: true });
  }

  for (const subdir of GITGENIUS_SUBDIRS) {
    const p = join(ggDir, subdir);
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true });
    }
  }

  sp.text = "Detecting repository metadata...";

  const parser = new GitParser(repoRoot);
  const metadata = await parser.fetchMetadata();
  const repoName = repoRoot.split("/").pop() ?? "unknown";

  sp.text = "Initializing database...";

  const db = dbPath(repoRoot);
  runMigrations(db);

  sp.text = "Storing repository configuration...";

  const prisma = getPrisma(db);

  const repo = await createRepository(prisma, {
    path: repoRoot,
    name: repoName,
    defaultBranch: metadata.defaultBranch,
    headCommit: metadata.headCommit,
    gitVersion: metadata.gitVersion,
  });

  const config = {
    repoRoot,
    repoId: repo.id,
    createdAt: new Date().toISOString(),
    gitVersion: metadata.gitVersion,
    defaultBranch: metadata.defaultBranch,
  };
  writeFileSync(configPath(repoRoot), JSON.stringify(config, null, 2));

  await closePrisma();

  sp.succeed(chalk.green(`Initialized GitGenius for ${chalk.bold(repoName)}`));
  console.log(`  ${chalk.dim("Location:")}  ${ggDir}`);
  console.log(`  ${chalk.dim("Database:")} ${db}`);
  console.log(`  ${chalk.dim("Default:")}   ${metadata.defaultBranch} @ ${metadata.headCommit!.slice(0, 7)}`);
  console.log();
  console.log(`  ${chalk.cyan("Next:")} ${chalk.bold("gitgenius index")} — parse commit history`);
}
