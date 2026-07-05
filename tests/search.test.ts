import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { chunkCommand } from "../src/commands/chunk.js";
import { analyzeCommand } from "../src/commands/analyze.js";
import { embedCommand } from "../src/commands/embed.js";
import { searchCommand } from "../src/commands/search.js";
import { withFixture } from "./setup.js";
import { createMockProvider } from "../src/ai/mock.js";
import { createMockEmbedder } from "../src/embeddings/mock.js";
import { Bm25Index } from "../src/search/bm25.js";
import { cosineSimilarity } from "../src/search/vector.js";
import { hybridSearch, normalizeScores } from "../src/search/hybrid.js";

describe("BM25", () => {
  it("finds matching documents by keyword", () => {
    const idx = new Bm25Index();
    idx.add({ id: "1", text: "fix jwt token validation bug" });
    idx.add({ id: "2", text: "add redis cache layer" });
    idx.add({ id: "3", text: "refactor authentication module" });

    const results = idx.search("jwt token");
    expect(results.has("1")).toBe(true);
    expect(results.get("1")!.score).toBeGreaterThan(0);
  });

  it("ranks shorter documents higher for same term frequency", () => {
    const idx = new Bm25Index();
    // Both docs have "jwt" once, but doc 3 is shorter → BM25 prefers it
    idx.add({ id: "1", text: "fix jwt token validation bug in auth" });
    idx.add({ id: "3", text: "add jwt auth middleware" });
    idx.add({ id: "2", text: "update readme documentation" });

    const results = idx.search("jwt auth");
    const sorted = Array.from(results.values()).sort((a, b) => b.score - a.score);
    // Doc 3 has higher density of query terms → should rank first
    expect(sorted[0]!.docId).toBe("3");
    expect(sorted[0]!.score).toBeGreaterThan(0);
  });

  it("returns empty for non-matching query", () => {
    const idx = new Bm25Index();
    idx.add({ id: "1", text: "fix jwt token" });
    const results = idx.search("redis");
    expect(results.size).toBe(0);
  });

  it("handles multiple documents", () => {
    const idx = new Bm25Index();
    const docs = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      text: `commit number ${i} with some changes and fixes`,
    }));
    idx.addAll(docs);

    const results = idx.search("fixes changes");
    expect(results.size).toBe(10);
  });
});

describe("cosine similarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [0.1, 0.2, 0.3, 0.4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns positive for similar vectors", () => {
    const a = [0.1, 0.2, 0.3];
    const b = [0.12, 0.19, 0.31];
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.9);
  });

  it("handles empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("hybrid search", () => {
  it("combines BM25 and vector scores", () => {
    // b has zero BM25 score but high vector score
    // a has high BM25 score but low vector score
    const bm25 = new Map([
      ["a", { score: 0.9, docId: "a" }],
      ["b", { score: 0.0, docId: "b" }],
    ]);
    const vector = new Map([
      ["a", { score: 0.1, docId: "a" }],
      ["b", { score: 0.9, docId: "b" }],
    ]);
    const chunkData = new Map([
      ["a", { summary: "doc a", keywords: [], commitCount: 2, startIndex: 0, endIndex: 1 }],
      ["b", { summary: "doc b", keywords: [], commitCount: 3, startIndex: 2, endIndex: 4 }],
    ]);

    const results = hybridSearch(bm25, vector, chunkData, {
      bm25Weight: 0.4,
      vectorWeight: 0.6,
    });

    expect(results.length).toBe(2);
    // a: 0.4 * 1 + 0.6 * 0.111 = 0.467
    // b: 0.4 * 0 + 0.6 * 1 = 0.600
    // b ranks higher
    expect(results[0]!.chunkId).toBe("b");
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    // Scores should be positive
    expect(results[0]!.score).toBeGreaterThan(0);
    expect(results[1]!.score).toBeGreaterThan(0);
  });
});

describe("search integration", () => {
  async function setupFullRepo(repoDir: string) {
    await indexCommand(repoDir);
    await chunkCommand(repoDir);
    const mockAi = createMockProvider();
    await analyzeCommand(repoDir, { provider: mockAi });
    const mockEmbedder = createMockEmbedder(128);
    await embedCommand(repoDir, { provider: mockEmbedder });
  }

  it("returns search results from indexed repo", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await setupFullRepo(repoDir);

      const mockEmbedder = createMockEmbedder(128);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: string[]) => logs.push(args.join(""));

      await searchCommand("auth", repoDir, { provider: mockEmbedder, limit: 5 });

      console.log = originalLog;

      const output = logs.join(" ");
      expect(output).toContain("Top");
    });
  });

  it("returns results for keyword search", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await setupFullRepo(repoDir);

      const mockEmbedder = createMockEmbedder(128);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: string[]) => logs.push(args.join(""));

      await searchCommand("jwt", repoDir, { provider: mockEmbedder });

      console.log = originalLog;

      const output = logs.join(" ");
      expect(output).toContain("Top");
    });
  });

  it("scores results between 0 and 100", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await setupFullRepo(repoDir);

      const mockEmbedder = createMockEmbedder(128);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: string[]) => logs.push(args.join(""));

      await searchCommand("auth", repoDir, { provider: mockEmbedder });

      console.log = originalLog;

      const output = logs.join(" ");
      expect(output).toMatch(/Score: \d+%/);
    });
  });
});
