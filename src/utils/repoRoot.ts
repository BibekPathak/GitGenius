import { existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";

export class NotAGitRepoError extends Error {
  constructor(path: string) {
    super(`Not a git repository: ${path}`);
    this.name = "NotAGitRepoError";
  }
}

export function findRepoRoot(startDir: string = process.cwd()): string {
  let current = startDir;

  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new NotAGitRepoError(startDir);
    }
    current = parent;
  }
}
