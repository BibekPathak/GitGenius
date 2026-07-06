import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { search } from "../search/index.js";
import type { SearchResult } from "../search/types.js";
import type { EmbeddingProvider } from "../embeddings/types.js";

export interface RagOptions {
  limit?: number;
  model?: string;
  /** For testing: override the LLM answer generation */
  generateAnswer?: (prompt: { system: string; user: string }) => Promise<string>;
}

export interface RagResult {
  answer: string;
  sources: SearchResult[];
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set");
  return key;
}

export function buildPrompt(question: string, sources: SearchResult[]): { system: string; user: string } {
  const contextLines = sources
    .map(
      (s, i) =>
        `[${i + 1}] Chunk "${s.summary.slice(0, 80)}"\n    Keywords: ${s.keywords.join(", ")}\n    Commits:\n${s.commits
          .map((c) => `      - ${c.hash.slice(0, 7)} by ${c.authorName}: ${c.message.slice(0, 80)}`)
          .join("\n")}`
    )
    .join("\n\n");

  return {
    system: `You are an expert git repository analyst. Answer questions about the codebase history based on the provided context.
Use specific commit references (by hash) when possible. If the context doesn't contain enough information, say so.
Keep answers concise and focused on the git history.`,
    user: `Context from repository history:\n\n${contextLines}\n\nQuestion: ${question}`,
  };
}

export async function ask(
  db: PrismaClient,
  repoId: string,
  repoName: string,
  question: string,
  embedder: EmbeddingProvider,
  options: RagOptions = {}
): Promise<RagResult> {
  const limit = options.limit ?? 5;

  // 1. Retrieve relevant chunks
  const sources = await search(db, repoId, question, embedder, {
    limit,
    bm25Weight: 0.3,
    vectorWeight: 0.7,
  });

  if (sources.length === 0) {
    return { answer: "No relevant commits found for this question.", sources: [] };
  }

  // 2. Build prompt with context
  const prompt = buildPrompt(question, sources);

  // 3. Generate answer via LLM
  let answer: string;

  if (options.generateAnswer) {
    answer = await options.generateAnswer(prompt);
  } else {
    const apiKey = getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: options.model ?? "gemini-2.0-flash",
    });

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: prompt.system + "\n\n" + prompt.user }] },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    answer = result.response.text().trim();
  }

  return { answer, sources };
}
