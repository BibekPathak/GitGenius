import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { chunkCommand } from "../src/commands/chunk.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

const TMP_DIR = join(import.meta.dirname, ".tmp");

describe("chunk", () => {
  it("creates chunks from indexed commits (size=3)", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir, { size: 3 });

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany({
        orderBy: { startIndex: "asc" },
        include: { commits: { include: { commit: { select: { message: true, hash: true } } } } },
      });
      await closePrisma();

      // 5 commits with chunk size 3 → 2 chunks (3 + 2)
      expect(chunks.length).toBe(2);

      // First chunk: commits 0-2 (3 commits)
      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(2);
      expect(chunks[0].commitCount).toBe(3);
      expect(chunks[0].commits.length).toBe(3);

      // Second chunk: commits 3-4 (2 commits)
      expect(chunks[1].startIndex).toBe(3);
      expect(chunks[1].endIndex).toBe(4);
      expect(chunks[1].commitCount).toBe(2);
      expect(chunks[1].commits.length).toBe(2);
    });
  });

  it("creates a single chunk when size > commit count", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir, { size: 100 });

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany();
      await closePrisma();

      expect(chunks.length).toBe(1);
      expect(chunks[0].commitCount).toBe(5);
    });
  });

  it("is resumable — only chunks unprocessed commits", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);

      // First chunk run: size=3 → 2 chunks
      await chunkCommand(repoDir, { size: 3 });
      let prisma = getPrisma(dbPath(repoDir));
      let chunks = await prisma.chunk.findMany();
      await closePrisma();
      expect(chunks.length).toBe(2);

      // Add more commits
      const { simpleGit } = await import("simple-git");
      const { writeFileSync } = await import("node:fs");
      const git = simpleGit(repoDir);
      writeFileSync(join(repoDir, "extra.ts"), "// extra\n");
      await git.add(".");
      await git.commit("Extra commit");
      writeFileSync(join(repoDir, "extra2.ts"), "// extra2\n");
      await git.add(".");
      await git.commit("Extra commit 2");

      // Re-index (gets 2 new)
      await indexCommand(repoDir);

      // Second chunk run: gets the 2 new commits as a new chunk
      await chunkCommand(repoDir, { size: 3 });

      prisma = getPrisma(dbPath(repoDir));
      chunks = await prisma.chunk.findMany({ orderBy: { startIndex: "asc" } });
      await closePrisma();

      // Now 7 commits total: chunks should be [0-2], [3-4], [5-6]
      expect(chunks.length).toBe(3);
      expect(chunks[2].startIndex).toBe(5);
      expect(chunks[2].endIndex).toBe(6);
      expect(chunks[2].commitCount).toBe(2);
    });
  });

  it("commits in chunks have correct content", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir, { size: 3 });

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany({
        orderBy: { startIndex: "asc" },
        include: {
          commits: {
            include: { commit: { select: { message: true, authorDate: true, authorName: true } } },
          },
        },
      });
      await closePrisma();

      // 5 commits, chunk size 3 → first chunk has 3 commits, second has 2
      expect(chunks[0].commitCount).toBe(3);
      expect(chunks[1].commitCount).toBe(2);

      // Collect all messages from both chunks
      const allMessages = chunks.flatMap((c) => c.commits.map((cc) => cc.commit.message));

      expect(allMessages.length).toBe(5);
      expect(allMessages).toContain("Initial commit");
      expect(allMessages).toContain("Add auth module");
      expect(allMessages).toContain("Fix JWT token validation");
      expect(allMessages).toContain("Refactor auth into utils");
      expect(allMessages).toContain("Add Redis cache layer");
    });
  });

  it("handles empty repo (no indexed commits)", async () => {
    await withFixture("empty-repo", async (repoDir) => {
      try {
        await chunkCommand(repoDir, { size: 3 });
      } catch (e) {
        // Acceptable — no commits to chunk
        return;
      }

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany();
      await closePrisma();
      expect(chunks.length).toBe(0);
    });
  });
});
