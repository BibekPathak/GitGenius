export function extractJson(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return jsonMatch[1]!.trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0].trim();
  return text;
}

export function sanitizeJson(text: string): string {
  return text
    .replace(/,\s*}/g, "}")
    .replace(/,\s*\]/g, "]")
    .replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/\\'([^']*?)\\'/g, "'$1'")
    .replace(/\\([^"\\\/bfnrtu])/g, "$1")
    .trim();
}

export function parseJson(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return { summary: "", category: "other", risk: "low", keywords: [], confidence: 0 };
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(sanitizeJson(text)) as Record<string, unknown>;
    } catch {
      const lastBrace = text.lastIndexOf("}");
      if (lastBrace > 0) {
        const truncated = text.slice(0, lastBrace + 1);
        try {
          return JSON.parse(sanitizeJson(truncated)) as Record<string, unknown>;
        } catch {
          /* fall through */
        }
      }
      console.warn(`Warning: Failed to parse JSON response, using defaults. Text: ${text.slice(0, 100)}`);
      return { summary: "", category: "other", risk: "low", keywords: [], confidence: 0 };
    }
  }
}
