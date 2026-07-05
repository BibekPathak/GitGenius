import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { chunkCommand } from "../src/commands/chunk.js";
import { analyzeCommand } from "../src/commands/analyze.js";
import { embedCommand } from "../src/commands/embed.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";
import { createMockProvider } from "../src/ai/mock.js";
import { createMockEmbedder } from "../src/embeddings/mock.js";

describe("embed", () => {
  async function setupIndexedRepo(repoDir: string) {
    await indexCommand(repoDir);
    await chunkCommand(repoDir);
    await analyzeCommand(repoDir, { provider: createMockProvider() });
  }

  it("generates embeddings for analyzed chunks", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await setupIndexedRepo(repoDir);

      const mockEmbedder = createMockEmbedder(4);
      await embedCommand(repoDir, { provider: mockEmbedder });

      const prisma = getPrisma(dbPath(repoDir));
      const embeddings = await prisma.embedding.findMany();
      const chunks = await prisma.chunk.findMany();
      await closePrisma();

      expect(embeddings.length).toBe(chunks.length);
      for (const emb of embeddings) {
        expect(emb.dimension).toBe(4);
        expect(emb.model).toBe("mock");
        expect(emb.sourceType).toBe("chunk");

        const vector = JSON.parse(emb.vector) as number[];
        expect(vector.length).toBe(4);
        expect(vector.every((v) => typeof v === "number")).toBe(true);
      }
    });
  });

  it("skips chunks that already have embeddings", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await setupIndexedRepo(repoDir);

      const mockEmbedder = createMockEmbedder(4);

      // First run
      await embedCommand(repoDir, { provider: mockEmbedder });

      // Second run — should skip all
      await embedCommand(repoDir, { provider: mockEmbedder });

      const prisma = getPrisma(dbPath(repoDir));
      const count = await prisma.embedding.count();
      await closePrisma();

      // Should still be exactly 1 embedding per chunk
      const chunks = await prisma.chunk.findMany();
      expect(count).toBe(chunks.length);
    });
  });

  it("stores vector as valid JSON array", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await setupIndexedRepo(repoDir);

      const mockEmbedder = createMockEmbedder(8);
      await embedCommand(repoDir, { provider: mockEmbedder });

      const prisma = getPrisma(dbPath(repoDir));
      const embeddings = await prisma.embedding.findMany();
      await closePrisma();

      for (const emb of embeddings) {
        const vector = JSON.parse(emb.vector) as number[];
        expect(Array.isArray(vector)).toBe(true);
        expect(vector.length).toBe(8);
      }
    });
  });

  it("stores content text for debugging", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await setupIndexedRepo(repoDir);

      const mockEmbedder = createMockEmbedder(4);
      await embedCommand(repoDir, { provider: mockEmbedder });

      const prisma = getPrisma(dbPath(repoDir));
      const embeddings = await prisma.embedding.findMany();
      await closePrisma();

      for (const emb of embeddings) {
        expect(emb.content.length).toBeGreaterThan(0);
        expect(emb.content).toContain("commits");
      }
    });
  });

  it("handles empty repo gracefully", async () => {
    await withFixture("empty-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir);

      const mockEmbedder = createMockEmbedder(4);
      // Should not throw — no chunks to embed
      await embedCommand(repoDir, { provider: mockEmbedder });

      const prisma = getPrisma(dbPath(repoDir));
      const count = await prisma.embedding.count();
      await closePrisma();

      expect(count).toBe(0);
    });
  });
});
