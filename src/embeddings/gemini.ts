import { GoogleGenerativeAI } from "@google/generative-ai";
import type { EmbeddingProvider, EmbeddingResult } from "./types.js";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set");
  return key;
}

const DEFAULT_MODEL = "text-embedding-004";

export function createGeminiEmbedder(modelName?: string): EmbeddingProvider {
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = modelName ?? DEFAULT_MODEL;

  return {
    name: `gemini/${model}`,

    async embed(text: string): Promise<EmbeddingResult> {
      const embedModel = genAI.getGenerativeModel({ model });
      const result = await embedModel.embedContent(text);
      const values = result.embedding?.values ?? [];
      return { vector: values, model, dimension: values.length };
    },

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
      const results: EmbeddingResult[] = [];
      for (const text of texts) {
        results.push(await this.embed(text));
      }
      return results;
    },
  };
}
