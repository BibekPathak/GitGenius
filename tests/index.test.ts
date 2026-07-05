import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

const TMP_DIR = join(import.meta.dirname, ".tmp");

describe("index", () => {
  it("parses all commits in sample-repo (5 commits)", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const count = await prisma.commit.count();
      const commits = await prisma.commit.findMany({ orderBy: { authorDate: "asc" } });
      await closePrisma();

      expect(count).toBe(5);

      // Verify commit messages in order
      const messages = commits.map((c) => c.message);
      expect(messages[0]).toContain("Initial");
      expect(messages[1]).toContain("Add auth");
      expect(messages[2]).toContain("Fix JWT");
      expect(messages[3]).toContain("Refactor auth");
      expect(messages[4]).toContain("Add Redis");
    });
  });

  it("stores commit authors correctly", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const commits = await prisma.commit.findMany({ orderBy: { authorDate: "asc" } });
      await closePrisma();

      expect(commits[0].authorName).toBe("Alice");
      expect(commits[0].authorEmail).toBe("alice@test.com");
      expect(commits[1].authorName).toBe("Bob");
      expect(commits[1].authorEmail).toBe("bob@test.com");
      expect(commits[4].authorName).toBe("Charlie");
    });
  });

  it("stores files for each commit", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const commitFiles = await prisma.commitFile.findMany({
        include: { file: true, commit: true },
      });
      await closePrisma();

      expect(commitFiles.length).toBeGreaterThan(0);

      // First commit should have README.md and src/index.ts
      const firstCommitFiles = commitFiles.filter(
        (cf) => cf.commit.message.includes("Initial")
      );
      const paths = firstCommitFiles.map((cf) => cf.file.path);
      expect(paths).toContain("README.md");
      expect(paths).toContain("src/index.ts");
    });
  });

  it("stores branches", async () => {
    await withFixture("branches", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const branches = await prisma.branch.findMany();
      await closePrisma();

      const names = branches.map((b) => b.name);
      expect(names).toContain("feature-a");
      expect(names).toContain("feature-b");
    });
  });

  it("stores tags", async () => {
    await withFixture("tags", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const tags = await prisma.tag.findMany();
      await closePrisma();

      const names = tags.map((t) => t.name);
      expect(names).toContain("v1.0.0");
      expect(names).toContain("v1.1.0");
      expect(names).toContain("v2.0.0");
    });
  });

  it("parses merge commits", async () => {
    await withFixture("merge-history", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const commits = await prisma.commit.findMany({
        orderBy: { authorDate: "asc" },
      });
      await closePrisma();

      expect(commits.length).toBeGreaterThanOrEqual(3);
      const messages = commits.map((c) => c.message);
      expect(messages).toContain("Initial commit");
    });
  });

  it("handles renamed files", async () => {
    await withFixture("rename-file", async (repoDir) => {
      await indexCommand(repoDir);

      const prisma = getPrisma(dbPath(repoDir));
      const fileCount = await prisma.file.count();
      const commitFileCount = await prisma.commitFile.count();
      await closePrisma();

      expect(fileCount).toBe(2);
      expect(commitFileCount).toBe(2);
    });
  });
});
