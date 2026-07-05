import { SimpleGit } from "simple-git";
import { createGitClient, getAllCommitHashes, getCommitDetails, getBranches, getTags, getHeadCommit, getDefaultBranch, getGitVersion } from "./logParser.js";
import type { ParsedCommit } from "../types/index.js";

export interface RepoMetadata {
  defaultBranch: string;
  headCommit: string;
  gitVersion: string;
}

export interface IndexResult {
  newHashes: string[];
  commits: ParsedCommit[];
  branches: { name: string; commitHash: string }[];
  tags: { name: string; commitHash: string }[];
  metadata: RepoMetadata;
  duration: number;
}

export class GitParser {
  private git: SimpleGit;

  constructor(baseDir: string) {
    this.git = createGitClient(baseDir);
  }

  async getAllHashes(): Promise<string[]> {
    return getAllCommitHashes(this.git);
  }

  async getNewHashes(indexedHashes: Set<string>): Promise<string[]> {
    const allHashes = await this.getAllHashes();
    return allHashes.filter((h) => !indexedHashes.has(h));
  }

  async fetchCommits(hashes: string[]): Promise<ParsedCommit[]> {
    if (hashes.length === 0) return [];

    const details = await getCommitDetails(this.git, hashes);
    return details.map((d) => ({
      hash: d.hash,
      message: d.message,
      authorName: d.authorName,
      authorEmail: d.authorEmail,
      authorDate: d.authorDate,
      insertions: d.insertions,
      deletions: d.deletions,
      parentHashes: d.parentHashes,
      files: d.files,
    }));
  }

  async fetchMetadata(): Promise<RepoMetadata> {
    const [defaultBranch, headCommit, gitVersion] = await Promise.all([
      getDefaultBranch(this.git),
      getHeadCommit(this.git),
      getGitVersion(this.git),
    ]);
    return { defaultBranch, headCommit, gitVersion };
  }

  async fetchBranches(): Promise<{ name: string; commitHash: string }[]> {
    return getBranches(this.git);
  }

  async fetchTags(): Promise<{ name: string; commitHash: string }[]> {
    return getTags(this.git);
  }

  async indexNewCommits(indexedHashes: Set<string>): Promise<IndexResult> {
    const start = performance.now();

    const newHashes = await this.getNewHashes(indexedHashes);
    const [commits, branches, tags, metadata] = await Promise.all([
      this.fetchCommits(newHashes),
      this.fetchBranches(),
      this.fetchTags(),
      this.fetchMetadata(),
    ]);

    const duration = performance.now() - start;

    return { newHashes, commits, branches, tags, metadata, duration };
  }
}
