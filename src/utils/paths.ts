import { join } from "node:path";

export function gitGeniusDir(repoRoot: string): string {
  return join(repoRoot, ".gitgenius");
}

export function dbPath(repoRoot: string): string {
  return join(gitGeniusDir(repoRoot), "gitgenius.db");
}

export function configPath(repoRoot: string): string {
  return join(gitGeniusDir(repoRoot), "config.json");
}

export function cacheDir(repoRoot: string): string {
  return join(gitGeniusDir(repoRoot), "cache");
}

export function embeddingsDir(repoRoot: string): string {
  return join(gitGeniusDir(repoRoot), "embeddings");
}

export function reportsDir(repoRoot: string): string {
  return join(gitGeniusDir(repoRoot), "reports");
}

export function logsDir(repoRoot: string): string {
  return join(gitGeniusDir(repoRoot), "logs");
}

export const GITGENIUS_SUBDIRS = ["cache", "embeddings", "reports", "logs"] as const;
