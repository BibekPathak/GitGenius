import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { initCommand } from "../src/commands/init.js";
import { findRepoRoot, NotAGitRepoError } from "../src/utils/repoRoot.js";
import { gitGeniusDir, dbPath, configPath } from "../src/utils/paths.js";
import { fixturePath, copyFixture } from "./setup.js";

const TMP_DIR = join(import.meta.dirname, ".tmp");

describe("init", () => {
  it("creates .gitgenius directory with all subdirectories", async () => {
    const repoDir = join(TMP_DIR, "init-test");
    copyFixture("sample-repo", repoDir);

    await initCommand(repoDir);

    expect(existsSync(gitGeniusDir(repoDir))).toBe(true);
    expect(existsSync(join(gitGeniusDir(repoDir), "cache"))).toBe(true);
    expect(existsSync(join(gitGeniusDir(repoDir), "embeddings"))).toBe(true);
    expect(existsSync(join(gitGeniusDir(repoDir), "reports"))).toBe(true);
    expect(existsSync(join(gitGeniusDir(repoDir), "logs"))).toBe(true);
  });

  it("creates the SQLite database file", async () => {
    const repoDir = join(TMP_DIR, "init-db-test");
    copyFixture("sample-repo", repoDir);

    await initCommand(repoDir);

    expect(existsSync(dbPath(repoDir))).toBe(true);
  });

  it("creates config.json", async () => {
    const repoDir = join(TMP_DIR, "init-config-test");
    copyFixture("sample-repo", repoDir);

    await initCommand(repoDir);

    expect(existsSync(configPath(repoDir))).toBe(true);
  });

  it("stores repository metadata in the database", async () => {
    const repoDir = join(TMP_DIR, "init-meta-test");
    copyFixture("sample-repo", repoDir);

    await initCommand(repoDir);

    const { getPrisma, closePrisma } = await import("../src/db/client.js");
    const { dbPath } = await import("../src/utils/paths.js");
    const prisma = getPrisma(dbPath(repoDir));
    const repo = await prisma.repository.findUnique({ where: { path: repoDir } });
    await closePrisma();

    expect(repo).not.toBeNull();
    expect(repo!.path).toBe(repoDir);
    expect(repo!.defaultBranch).toBeTruthy();
    expect(repo!.gitVersion).toBeTruthy();
  });

  it("fails when run outside a git repository", async () => {
    const nonRepoDir = join(TMP_DIR, "not-a-repo");
    rmSync(nonRepoDir, { recursive: true, force: true });

    await expect(initCommand(nonRepoDir)).rejects.toThrow();
  });
});
