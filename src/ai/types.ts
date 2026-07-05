export interface ChunkData {
  id: string;
  startIndex: number;
  endIndex: number;
  repository: string;
  commits: CommitData[];
}

export interface CommitData {
  hash: string;
  message: string;
  authorName: string;
  authorDate: string;
  insertions: number;
  deletions: number;
  files: string[];
}

export interface ChunkAnalysis {
  summary: string;
  category: string;
  risk: string;
  keywords: string[];
  confidence: number;
}

export interface AnalyzeResult {
  chunkId: string;
  analysis: ChunkAnalysis;
  success: boolean;
  error?: string;
}

export const AI_PROVIDERS = ["gemini", "openai", "claude"] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

export interface AIProvider {
  analyze(chunk: ChunkData): Promise<ChunkAnalysis>;
  name: AIProviderName;
}
