import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { getFileTimeline, listFiles } from "../src/evolution/fileTimeline.js";
import { withFixture } from "./setup.js";

describe("file evolution", () => {
  it("returns timeline for a file", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const timeline = await getFileTimeline(prisma, repo.id, "src/auth.ts");
      await closePrisma();

      expect(timeline).not.toBeNull();
      expect(timeline!.path).toBe("src/auth.ts");
      expect(timeline!.totalCommits).toBeGreaterThanOrEqual(2);
      expect(timeline!.createdBy).toBeTruthy();
    });
  });

  it("returns null for non-existent file", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const timeline = await getFileTimeline(prisma, repo.id, "nonexistent.ts");
      await closePrisma();

      expect(timeline).toBeNull();
    });
  });

  it("includes all events in correct order", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const timeline = await getFileTimeline(prisma, repo.id, "README.md");
      await closePrisma();

      expect(timeline).not.toBeNull();
      expect(timeline!.events.length).toBeGreaterThanOrEqual(2);
      // Check chronological order
      for (let i = 1; i < timeline!.events.length; i++) {
        expect(timeline!.events[i]!.authorDate.getTime())
          .toBeGreaterThanOrEqual(timeline!.events[i - 1]!.authorDate.getTime());
      }
    });
  });

  it("lists files sorted by commit count", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const files = await listFiles(prisma, repo.id, { sortBy: "commits" });
      await closePrisma();

      expect(files.length).toBeGreaterThan(0);
      // Should be sorted descending by commit count
      for (let i = 1; i < files.length; i++) {
        expect(files[i]!.totalCommits).toBeLessThanOrEqual(files[i - 1]!.totalCommits);
      }
    });
  });

  it("lists files sorted by churn", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const files = await listFiles(prisma, repo.id, { sortBy: "churn" });
      await closePrisma();

      expect(files.length).toBeGreaterThan(0);
      // Should be sorted descending by churn
      for (let i = 1; i < files.length; i++) {
        const prevChurn = files[i - 1]!.totalInsertions + files[i - 1]!.totalDeletions;
        const currChurn = files[i]!.totalInsertions + files[i]!.totalDeletions;
        expect(currChurn).toBeLessThanOrEqual(prevChurn);
      }
    });
  });
});
