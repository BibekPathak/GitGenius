export interface SearchResult {
  chunkId: string;
  score: number;
  bm25Score: number;
  vectorScore: number;
  summary: string;
  keywords: string[];
  commitCount: number;
  startIndex: number;
  endIndex: number;
  commits: SearchCommit[];
}

export interface SearchCommit {
  hash: string;
  message: string;
  authorName: string;
  authorDate: Date;
}

export interface SearchOptions {
  limit?: number;
  bm25Weight?: number;
  vectorWeight?: number;
}
