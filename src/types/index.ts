export const CommitStatus = {
  PENDING: "PENDING",
  INDEXED: "INDEXED",
  ANALYZED: "ANALYZED",
  FAILED: "FAILED",
} as const;
export type CommitStatus = (typeof CommitStatus)[keyof typeof CommitStatus];

export const FileStatus = {
  ADDED: "added",
  MODIFIED: "modified",
  DELETED: "deleted",
  RENAMED: "renamed",
} as const;
export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];

export const JobType = {
  INDEX: "INDEX",
  ANALYZE: "ANALYZE",
  EMBED: "EMBED",
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const AnalysisStatus = {
  PENDING: "PENDING",
  ANALYZING: "ANALYZING",
  ANALYZED: "ANALYZED",
  FAILED: "FAILED",
} as const;
export type AnalysisStatus = (typeof AnalysisStatus)[keyof typeof AnalysisStatus];

export const ChunkStatus = {
  PENDING: "PENDING",
  ANALYZING: "ANALYZING",
  ANALYZED: "ANALYZED",
  FAILED: "FAILED",
} as const;
export type ChunkStatus = (typeof ChunkStatus)[keyof typeof ChunkStatus];

export interface ChunkInput {
  startIndex: number;
  endIndex: number;
  commitCount: number;
  repositoryId: string;
  commitIds: string[];
}

export interface ParsedCommit {
  hash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authorDate: Date;
  insertions: number;
  deletions: number;
  parentHashes: string[];
  files: ParsedFile[];
}

export interface ParsedFile {
  path: string;
  status: FileStatus;
  insertions: number;
  deletions: number;
}

export interface RepoConfig {
  repoRoot: string;
  dbPath: string;
}
