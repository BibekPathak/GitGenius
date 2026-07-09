import type { AIProvider, ChunkData, ChunkAnalysis, AIProviderName } from "./types.js";
import { buildAnalyzePrompt } from "../prompts/analyze.js";
import { extractJson, parseJson } from "./parse.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY environment variable is not set");
  return key;
}

function getBaseUrl(): string {
  return process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;
}

function getModel(): string {
  return process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
}

export function createOpenAIProvider(
  modelName?: string,
  baseUrl?: string
): AIProvider {
  const apiKey = getApiKey();
  const model = modelName ?? getModel();
  const base = (baseUrl ?? getBaseUrl()).replace(/\/+$/, "");

  return {
    name: "openai" as AIProviderName,

    async analyze(chunk: ChunkData): Promise<ChunkAnalysis> {
      const prompt = buildAnalyzePrompt(chunk);

      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`OpenAI API error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
      };

      const text = data.choices?.[0]?.message?.content ?? "";
      const jsonStr = extractJson(text);
      const parsed = parseJson(jsonStr) as Partial<ChunkAnalysis>;

      return {
        summary: parsed.summary ?? "No summary provided",
        category: parsed.category ?? "other",
        risk: parsed.risk ?? "low",
        keywords: parsed.keywords ?? [],
        confidence: parsed.confidence ?? 0,
      };
    },
  };
}
