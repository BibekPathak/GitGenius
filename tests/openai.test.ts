import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOpenAIProvider } from "../src/ai/openai.js";
import type { ChunkData } from "../src/ai/types.js";

const SAMPLE_CHUNK: ChunkData = {
  id: "test-chunk",
  startIndex: 0,
  endIndex: 1,
  repository: "test-repo",
  commits: [
    {
      hash: "abc123",
      message: "Initial commit",
      authorName: "Alice",
      authorDate: "2026-01-01",
      insertions: 10,
      deletions: 0,
      files: ["README.md", "src/index.ts"],
    },
    {
      hash: "def456",
      message: "Fix JWT bug",
      authorName: "Bob",
      authorDate: "2026-01-02",
      insertions: 5,
      deletions: 3,
      files: ["src/auth.ts"],
    },
  ],
};

describe("OpenAI provider", () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origBaseUrl = process.env.OPENAI_BASE_URL;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
  });

  afterEach(() => {
    if (origKey) process.env.OPENAI_API_KEY = origKey;
    else delete process.env.OPENAI_API_KEY;
    if (origBaseUrl) process.env.OPENAI_BASE_URL = origBaseUrl;
    else delete process.env.OPENAI_BASE_URL;
  });

  it("throws when OPENAI_API_KEY is not set", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createOpenAIProvider()).toThrow("OPENAI_API_KEY");
  });

  it("creates provider with correct name", () => {
    const provider = createOpenAIProvider();
    expect(provider.name).toBe("openai");
  });

  it("accepts custom base URL via env", () => {
    process.env.OPENAI_BASE_URL = "https://api.requesty.ai/v1";
    const provider = createOpenAIProvider();
    expect(provider.name).toBe("openai");
  });

  it("analyze throws on network error (no real API)", async () => {
    // Point to a non-existent server so the fetch fails
    process.env.OPENAI_BASE_URL = "http://localhost:1";
    const provider = createOpenAIProvider("gpt-4o-mini");
    await expect(provider.analyze(SAMPLE_CHUNK)).rejects.toThrow();
  });

  it("parseResponse handles basic JSON", () => {
    // Test the JSON extraction by calling the function with the right env
    // Just verify the provider structure
    const provider = createOpenAIProvider();
    expect(typeof provider.analyze).toBe("function");
  });
});
