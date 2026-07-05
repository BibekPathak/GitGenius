import { simpleGit, SimpleGit } from "simple-git";
import type { ParsedCommit, ParsedFile, FileStatus } from "../types/index.js";

const COMMIT_DELIMITER = "===GITGENIUS_COMMIT===";
const FORMAT = [
  COMMIT_DELIMITER,
  "%H",  // hash
  "%an", // author name
  "%ae", // author email
  "%at", // author date (unix)
  "%P",  // parent hashes
  "%B",  // raw body (message)
  "===GITGENIUS_MSG_END===",
].join("%n");

function parseNumstatLine(line: string): { path: string; insertions: number; deletions: number; status: FileStatus } | null {
  const parts = line.trim().split("\t");
  if (parts.length < 3) return null;

  const insertions = parts[0] === "-" ? 0 : parseInt(parts[0]!, 10);
  const deletions = parts[1] === "-" ? 0 : parseInt(parts[1]!, 10);
  let path = parts[2]!;

  let status: FileStatus = "modified";

  // Git diff-tree --cc format: score old-path => new-path (4 parts)
  if (parts.length >= 4) {
    path = parts[3]!;
    const renameScore = parseInt(parts[2]!, 10);
    if (!isNaN(renameScore) && renameScore > 0) {
      status = "renamed";
    }
  }

  // Git log --numstat format: insertions\tdeletions\told-path => new-path
  const renameArrow = " => ";
  const arrowIdx = path.indexOf(renameArrow);
  if (arrowIdx !== -1) {
    path = path.slice(arrowIdx + renameArrow.length);
    status = "renamed";
  }

  return { path, insertions, deletions, status };
}

export interface DetailedCommit {
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

export function parseDetailedLogOutput(output: string): DetailedCommit[] {
  const result: DetailedCommit[] = [];
  const lines = output.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Skip until we find a commit delimiter
    if (lines[i] !== COMMIT_DELIMITER) {
      i++;
      continue;
    }
    i++; // skip COMMIT_DELIMITER

    // Read commit header
    if (i + 5 > lines.length) break;

    const hash = lines[i++]?.trim() ?? "";
    if (!hash || hash.length < 6) continue;

    const authorName = lines[i++]?.trim() ?? "";
    const authorEmail = lines[i++]?.trim() ?? "";
    const authorDate = parseInt(lines[i++] ?? "0", 10);
    const parentLine = lines[i++]?.trim() ?? "";
    const parentHashes = parentLine ? parentLine.split(/\s+/) : [];

    // Read message until MSG_END
    const msgLines: string[] = [];
    while (i < lines.length && lines[i] !== "===GITGENIUS_MSG_END===") {
      msgLines.push(lines[i]!);
      i++;
    }
    i++; // skip MSG_END
    const message = msgLines.join("\n").trim();

    // Read numstat lines until next COMMIT_DELIMITER or end
    const files: ParsedFile[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    while (i < lines.length) {
      const line = lines[i]!;
      if (line === COMMIT_DELIMITER) {
        // Don't consume — let outer loop handle it
        break;
      }
      if (line.match(/^\d+\t\d+\t/)) {
        const parsed = parseNumstatLine(line);
        if (parsed) {
          if (!files.some((f) => f.path === parsed.path)) {
            files.push(parsed);
            totalInsertions += parsed.insertions;
            totalDeletions += parsed.deletions;
          }
        }
      }
      i++;
    }

    if (files.length === 0) {
      files.push({ path: "UNKNOWN", status: "modified", insertions: 0, deletions: 0 });
    }

    result.push({
      hash,
      message,
      authorName,
      authorEmail,
      authorDate: new Date(authorDate * 1000),
      insertions: totalInsertions,
      deletions: totalDeletions,
      parentHashes,
      files,
    });
  }

  return result;
}

export function createGitClient(baseDir: string): SimpleGit {
  return simpleGit(baseDir);
}

export async function getAllCommitHashes(git: SimpleGit): Promise<string[]> {
  const result = await git.raw(["log", "--all", "--reverse", "--format=%H"]);
  return result.trim().split("\n").filter(Boolean);
}

export async function getCommitDetails(
  git: SimpleGit,
  hashes: string[]
): Promise<DetailedCommit[]> {
  if (hashes.length === 0) return [];

  // Get all commits with full details in a single call
  // We always read the full history but filter in code
  const result = await git.raw([
    "log",
    "--all",
    "--reverse",
    "--format=" + FORMAT,
    "--numstat",
  ]);

  const allCommits = parseDetailedLogOutput(result);
  const hashSet = new Set(hashes);

  return allCommits.filter((c) => hashSet.has(c.hash));
}

export async function getBranches(git: SimpleGit): Promise<{ name: string; commitHash: string }[]> {
  const result = await git.raw(["branch", "--format=%(refname:short)%09%(objectname)"]);
  return result
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, commitHash] = line.split("\t");
      return { name: name!, commitHash: commitHash! };
    });
}

export async function getTags(git: SimpleGit): Promise<{ name: string; commitHash: string }[]> {
  const result = await git.raw(["tag", "--format=%(refname:short)%09%(objectname)"]);
  return result
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, commitHash] = line.split("\t");
      return { name: name!, commitHash: commitHash! };
    });
}

export async function getHeadCommit(git: SimpleGit): Promise<string> {
  return (await git.raw(["rev-parse", "HEAD"])).trim();
}

export async function getDefaultBranch(git: SimpleGit): Promise<string> {
  try {
    return (await git.raw(["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    return "main";
  }
}

export async function getGitVersion(git: SimpleGit): Promise<string> {
  const result = await git.raw(["--version"]);
  return result.trim();
}

export async function getRefList(git: SimpleGit): Promise<string[]> {
  const result = await git.raw(["rev-list", "--all"]);
  return result.trim().split("\n").filter(Boolean);
}
