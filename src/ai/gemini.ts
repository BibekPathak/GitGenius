import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider, ChunkData, ChunkAnalysis, AIProviderName } from "./types.js";
import { buildAnalyzePrompt } from "../prompts/analyze.js";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return key;
}

export function createGeminiProvider(modelName?: string): AIProvider {
  const apiKey = getApiKey();
  const model = modelName ?? "gemini-2.0-flash";
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    name: "gemini" as AIProviderName,

    async analyze(chunk: ChunkData): Promise<ChunkAnalysis> {
      const prompt = buildAnalyzePrompt(chunk);

      const geminiModel = genAI.getGenerativeModel({ model });

      const result = await geminiModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt.system + "\n\n" + prompt.user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      });

      const response = result.response;
      const text = response.text().trim();

      // Extract JSON from the response (handle markdown code fences)
      const jsonStr = extractJson(text);
      const parsed = JSON.parse(jsonStr) as Partial<ChunkAnalysis>;

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

function extractJson(text: string): string {
  // Try to find JSON between ```json and ``` markers
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1]!.trim();
  }

  // Try to find a JSON object directly
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    return braceMatch[0].trim();
  }

  return text;
}
