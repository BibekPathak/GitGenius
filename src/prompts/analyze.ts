import type { ChunkData } from "../ai/types.js";

export interface BuiltPrompt {
  system: string;
  user: string;
}

const SYSTEM_PROMPT = `You are an expert code reviewer analyzing git commit history. Given a batch of commits, provide a structured analysis.

Return ONLY valid JSON (no markdown, no explanation) with this exact schema:
{
  "summary": "1-2 sentence summary of what these commits do overall",
  "category": "feature|bugfix|refactor|security|performance|docs|infrastructure|test|other",
  "risk": "low|medium|high",
  "keywords": ["up to", "5", "relevant", "keywords"],
  "confidence": 0.0-1.0
}

Category guidelines:
- feature: New functionality added
- bugfix: Bug fixes and error handling
- refactor: Code restructuring, no behavior change
- security: Security fixes or improvements
- performance: Performance optimizations
- docs: Documentation changes
- infrastructure: CI, config, build, dependency changes
- test: Test additions or changes
- other: Anything else

Risk guidelines:
- low: Routine changes, well-tested
- medium: Significant logic changes, moderate complexity
- high: Core system changes, risky modifications`;

export function buildAnalyzePrompt(chunk: ChunkData): BuiltPrompt {
  const commitLines = chunk.commits
    .map(
      (c, i) =>
        `Commit ${chunk.startIndex + i + 1}: ${c.hash.slice(0, 7)} by ${c.authorName} on ${c.authorDate}
Message: ${c.message}
Files: ${c.files.join(", ")} (${c.insertions}+, ${c.deletions}-)`
    )
    .join("\n\n");

  return {
    system: SYSTEM_PROMPT,
    user: `Analyze these commits from the "${chunk.repository}" repository:

${commitLines}`,
  };
}
