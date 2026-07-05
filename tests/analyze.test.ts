import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { chunkCommand } from "../src/commands/chunk.js";
import { analyzeCommand } from "../src/commands/analyze.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";
import { createMockProvider } from "../src/ai/mock.js";

describe("analyze", () => {
  it("analyzes pending chunks with mock provider", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir);

      const mockProvider = createMockProvider();

      await analyzeCommand(repoDir, { provider: mockProvider });

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany({ orderBy: { startIndex: "asc" } });
      await closePrisma();

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.status).toBe("ANALYZED");
        expect(chunk.summary).toBeTruthy();
        expect(chunk.keywords).toBeTruthy();
        expect(chunk.risks).toBeTruthy();
      }
    });
  });

  it("marks chunks as ANALYZED after successful analysis", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir, { size: 3 });

      const mockProvider = createMockProvider();

      await analyzeCommand(repoDir, { provider: mockProvider });

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany({ orderBy: { startIndex: "asc" } });
      await closePrisma();

      expect(chunks.length).toBe(2);
      for (const chunk of chunks) {
        expect(chunk.status).toBe("ANALYZED");
        expect(chunk.summary).toContain("commits");
      }
    });
  });

  it("handles provider failures gracefully (chunk marked FAILED)", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir);

      const mockProvider = createMockProvider(async () => {
        throw new Error("Simulated AI failure");
      });

      // Should not throw — handles failures gracefully
      await analyzeCommand(repoDir, { provider: mockProvider });

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany();
      await closePrisma();

      for (const chunk of chunks) {
        expect(chunk.status).toBe("FAILED");
      }
    });
  });

  it("skips already analyzed chunks", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir);

      const mockProvider = createMockProvider();

      // First run — analyzes all chunks
      await analyzeCommand(repoDir, { provider: mockProvider });

      // Second run — should skip all (already ANALYZED)
      await analyzeCommand(repoDir, { provider: mockProvider });

      // Verify chunks are still ANALYZED
      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany();
      await closePrisma();

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.status).toBe("ANALYZED");
      }
    });
  });

  it("retries FAILED chunks when --retry flag is set", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir);

      // First run: fail all chunks
      const failProvider = createMockProvider(async () => {
        throw new Error("Simulated failure");
      });
      await analyzeCommand(repoDir, { provider: failProvider });

      const prisma = getPrisma(dbPath(repoDir));
      let chunks = await prisma.chunk.findMany();
      await closePrisma();
      const failedCount = chunks.filter((c) => c.status === "FAILED").length;
      expect(failedCount).toBeGreaterThan(0);

      // Retry with successful provider
      const successProvider = createMockProvider();
      await analyzeCommand(repoDir, { provider: successProvider, retry: true });

      const prisma2 = getPrisma(dbPath(repoDir));
      chunks = await prisma2.chunk.findMany();
      await closePrisma();

      const analyzedCount = chunks.filter((c) => c.status === "ANALYZED").length;
      expect(analyzedCount).toBe(failedCount);
    });
  });

  it("stores analysis results in chunk fields", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      await chunkCommand(repoDir);

      const mockProvider = createMockProvider(async (chunk) => ({
        summary: `Custom: ${chunk.commits.length} commits`,
        category: "feature",
        risk: "medium",
        keywords: ["custom-keyword"],
        confidence: 0.95,
      }));

      await analyzeCommand(repoDir, { provider: mockProvider });

      const prisma = getPrisma(dbPath(repoDir));
      const chunks = await prisma.chunk.findMany();
      await closePrisma();

      for (const chunk of chunks) {
        expect(chunk.summary).toContain("Custom:");
        expect(chunk.keywords).toContain("custom-keyword");
        expect(chunk.risks).toBe("medium");
        expect(chunk.status).toBe("ANALYZED");
      }
    });
  });
});
