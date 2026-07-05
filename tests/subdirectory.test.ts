import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { copyFixture, initRepo, getRepoId } from "./setup.js";
import { mkdirSync } from "node:fs";

const TMP_DIR = join(import.meta.dirname, ".tmp");

describe("running from subdirectory", () => {
  it("indexes commits when running from a subdirectory", async () => {
    // Set up a repo with subdirectories
    const repoDir = join(TMP_DIR, "subdir-test");
    copyFixture("sample-repo", repoDir);
    await initRepo(repoDir);

    // Create a subdirectory within the repo
    const subDir = join(repoDir, "src", "utils");
    mkdirSync(subDir, { recursive: true });

    // Run index from the subdirectory
    await indexCommand(subDir);

    const prisma = getPrisma(dbPath(repoDir));
    const count = await prisma.commit.count();
    await closePrisma();

    expect(count).toBe(5);
  });

  it("fails when run from outside a git repo", async () => {
    const nonRepoDir = join(TMP_DIR, "outside");
    await expect(indexCommand(nonRepoDir)).rejects.toThrow();
  });
});
