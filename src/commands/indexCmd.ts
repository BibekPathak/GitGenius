import chalk from "chalk";
import { existsSync } from "node:fs";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository, getIndexedHashes, insertCommitsBatch, updateRepositoryMetadata, createJob, updateJob } from "../db/queries.js";
import { GitParser } from "../parser/gitParser.js";
import { spinner } from "../utils/spinner.js";
import { readFile } from "node:fs/promises";

export async function indexCommand(dir?: string): Promise<void> {
  const targetDir = dir ?? process.cwd();

  const sp = spinner("Preparing...").start();

  let repoRoot: string;
  try {
    repoRoot = findRepoRoot(targetDir);
  } catch (e) {
    sp.fail(chalk.red(`Not a git repository: ${targetDir}`));
    throw e;
  }

  const db = dbPath(repoRoot);
  if (!existsSync(db)) {
    sp.fail(chalk.red("GitGenius not initialized. Run: gitgenius init"));
    throw new Error("GitGenius not initialized");
  }

  const prisma = getPrisma(db);

  // Load repo from config or DB
  const config = JSON.parse(await readFile(configPath(repoRoot), "utf-8"));
  const repo = await getRepository(prisma, repoRoot);

  if (!repo) {
    sp.fail(chalk.red("Repository not found in database. Run: gitgenius init"));
    await closePrisma();
    throw new Error("Repository not found");
  }

  sp.text = "Finding new commits...";

  const parser = new GitParser(repoRoot);
  const indexedHashes = await getIndexedHashes(prisma, repo.id);

  const newHashes = await parser.getNewHashes(indexedHashes);
  if (newHashes.length === 0) {
    sp.succeed(chalk.green("Repository is up to date (0 new commits)"));
    await closePrisma();
    return;
  }

  // Create job
  const job = await createJob(prisma, repo.id, "INDEX");
  await updateJob(prisma, job.id, { status: "RUNNING", totalItems: newHashes.length, startedAt: new Date() });

  sp.text = `Parsing ${newHashes.length} new commit(s)...`;

  try {
    const commits = await parser.fetchCommits(newHashes);
    const [branches, tags, metadata] = await Promise.all([
      parser.fetchBranches(),
      parser.fetchTags(),
      parser.fetchMetadata(),
    ]);

    sp.text = `Storing ${commits.length} commit(s) in database...`;

    await insertCommitsBatch(prisma, repo.id, commits);

    // Store branches
    for (const branch of branches) {
      await prisma.branch.upsert({
        where: { name_repositoryId: { name: branch.name, repositoryId: repo.id } },
        update: { commitHash: branch.commitHash },
        create: { name: branch.name, commitHash: branch.commitHash, repositoryId: repo.id },
      });
    }

    // Store tags
    for (const tag of tags) {
      await prisma.tag.upsert({
        where: { name_repositoryId: { name: tag.name, repositoryId: repo.id } },
        update: { commitHash: tag.commitHash },
        create: { name: tag.name, commitHash: tag.commitHash, repositoryId: repo.id },
      });
    }

    const lastCommit = commits[commits.length - 1];
    await updateRepositoryMetadata(prisma, repo.id, {
      headCommit: metadata.headCommit,
      lastIndexedCommit: lastCommit?.hash,
      lastIndexedAt: new Date(),
    });

    await updateJob(prisma, job.id, {
      status: "SUCCESS",
      processedItems: commits.length,
      completedAt: new Date(),
    });

    sp.succeed(chalk.green(`Indexed ${commits.length} commit(s)`));
    console.log(`  ${chalk.dim("New commits:")}  ${commits.length}`);
    console.log(`  ${chalk.dim("Branches:")}    ${branches.length}`);
    console.log(`  ${chalk.dim("Tags:")}        ${tags.length}`);
    console.log(`  ${chalk.dim("Head:")}        ${metadata.headCommit.slice(0, 7)}`);
  } catch (err) {
    await updateJob(prisma, job.id, {
      status: "FAILED",
      failedItems: newHashes.length,
      completedAt: new Date(),
    });
    sp.fail(chalk.red(`Indexing failed: ${err}`));
    throw err;
  } finally {
    await closePrisma();
  }
}
