import type { EmbeddingProvider, EmbeddingResult } from "./types.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY environment variable is not set");
  return key;
}

function getBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
}

export function createOpenAIEmbedder(modelName?: string): EmbeddingProvider {
  const model = modelName ?? getModel();

  return {
    name: `openai/${model}`,

    async embed(text: string): Promise<EmbeddingResult> {
      const result = await this.embedBatch([text]);
      return result[0]!;
    },

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
      const apiKey = getApiKey();
      const baseUrl = getBaseUrl();

      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Embedding API error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        data: { embedding: number[] }[];
        model: string;
      };

      return data.data.map((d) => ({
        vector: d.embedding,
        model: data.model,
        dimension: d.embedding.length,
      }));
    },
  };
}
