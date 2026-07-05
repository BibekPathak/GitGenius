import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture, copyFixture, initRepo, getRepoId, getCommitCount } from "./setup.js";
import { simpleGit } from "simple-git";
import { writeFileSync } from "node:fs";
import { rmSync } from "node:fs";

const TMP_DIR = join(import.meta.dirname, ".tmp");

describe("resume (incremental indexing)", () => {
  it("only indexes new commits on second run", async () => {
    // Copy sample-repo (5 commits) to temp
    const repoDir = join(TMP_DIR, "resume-test");
    copyFixture("sample-repo", repoDir);
    await initRepo(repoDir);

    // Index (should get all 5)
    await indexCommand(repoDir);

    const prisma = getPrisma(dbPath(repoDir));
    let count = await prisma.commit.count();
    await closePrisma();

    expect(count).toBe(5);

    // Add 2 more commits to the repo
    const git = simpleGit(repoDir);
    writeFileSync(join(repoDir, "new-file-1.ts"), "// new 1\n");
    await git.add(".");
    await git.commit("New commit 1");

    writeFileSync(join(repoDir, "new-file-2.ts"), "// new 2\n");
    await git.add(".");
    await git.commit("New commit 2");

    // Index again (should only get 2 new)
    await indexCommand(repoDir);

    count = await getCommitCount(repoDir);

    expect(count).toBe(7);
  });

  it("handles zero new commits gracefully", async () => {
    const repoDir = join(TMP_DIR, "resume-noop-test");
    copyFixture("sample-repo", repoDir);
    await initRepo(repoDir);

    // First index
    await indexCommand(repoDir);

    // Second index — no new commits
    await expect(indexCommand(repoDir)).resolves.not.toThrow();

    const prisma = getPrisma(dbPath(repoDir));
    const count = await prisma.commit.count();
    await closePrisma();

    expect(count).toBe(5);
  });
});
