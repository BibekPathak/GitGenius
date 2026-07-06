import { describe, it, expect } from "vitest";
import { indexCommand } from "../src/commands/indexCmd.js";
import { generateReleaseNotes } from "../src/releasenotes/index.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

describe("release notes", () => {
  it("generates release notes for commit range", async () => {
    await withFixture("tags", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const notes = await generateReleaseNotes(prisma, repo.id, "", "HEAD", "test-repo");
      await closePrisma();

      expect(notes.version).toBe("HEAD");
      expect(notes.commits.length).toBeGreaterThan(0);
      expect(notes.summary).toBeTruthy();
    });
  });

  it("groups commits by category", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const notes = await generateReleaseNotes(prisma, repo.id, "", "HEAD", "test-repo");
      await closePrisma();

      expect(Object.keys(notes.categories).length).toBeGreaterThan(0);
    });
  });
});
