import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { chunkCommand } from "../src/commands/chunk.js";
import { analyzeCommand } from "../src/commands/analyze.js";
import { embedCommand } from "../src/commands/embed.js";
import { ask } from "../src/rag/pipeline.js";
import { buildPrompt } from "../src/rag/pipeline.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";
import { createMockProvider } from "../src/ai/mock.js";
import { createMockEmbedder } from "../src/embeddings/mock.js";
import type { SearchResult } from "../src/search/types.js";

describe("RAG pipeline", () => {
  describe("buildPrompt", () => {
    it("includes source context in the prompt", () => {
      const sources: SearchResult[] = [
        {
          chunkId: "c1",
          score: 0.9,
          bm25Score: 0.8,
          vectorScore: 0.6,
          summary: "Fixed JWT token validation",
          keywords: ["jwt", "auth", "security"],
          commitCount: 1,
          startIndex: 0,
          endIndex: 0,
          commits: [
            { hash: "abc123", message: "Fix JWT token validation bug", authorName: "Alice", authorDate: new Date() },
          ],
        },
      ];

      const prompt = buildPrompt("How was JWT auth fixed?", sources);

      expect(prompt.system).toContain("git repository analyst");
      expect(prompt.user).toContain("jwt");
      expect(prompt.user).toContain("abc123");
      expect(prompt.user).toContain("Alice");
    });

    it("handles empty sources", () => {
      const prompt = buildPrompt("Any question?", []);
      expect(prompt.user).not.toContain("[1]");
    });
  });

  describe("ask", () => {
    async function setupFullRepo(repoDir: string) {
      await indexCommand(repoDir);
      await chunkCommand(repoDir);
      await analyzeCommand(repoDir, { provider: createMockProvider() });
      await embedCommand(repoDir, { provider: createMockEmbedder(128) });
    }

    it("returns answer from relevant sources", async () => {
      await withFixture("sample-repo", async (repoDir) => {
        await setupFullRepo(repoDir);

        const prisma = getPrisma(dbPath(repoDir));
        const repo = await prisma.repository.findFirstOrThrow();
        const mockEmbedder = createMockEmbedder(128);

        const result = await ask(prisma, repo.id, repo.name, "authentication", mockEmbedder, {
          generateAnswer: async (prompt) => {
            expect(prompt.user).toContain("auth");
            return "Auth was added in the second commit.";
          },
        });

        expect(result.answer).toContain("Auth was added");
        expect(result.sources.length).toBeGreaterThan(0);

        await closePrisma();
      });
    });

    it("returns no-results message when nothing matches", async () => {
      await withFixture("empty-repo", async (repoDir) => {
        await indexCommand(repoDir);
        const prisma = getPrisma(dbPath(repoDir));
        const repo = await prisma.repository.findFirstOrThrow();
        const mockEmbedder = createMockEmbedder(128);

        const result = await ask(prisma, repo.id, repo.name, "anything", mockEmbedder, {
          generateAnswer: async () => "should not be called",
        });

        expect(result.answer).toContain("No relevant commits");
        expect(result.sources.length).toBe(0);

        await closePrisma();
      });
    });
  });
});
