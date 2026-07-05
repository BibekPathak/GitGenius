import { simpleGit } from "simple-git";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dirname, "..", "tests", "fixtures");

async function createFixture(name: string, fn: (dir: string) => Promise<void>) {
  const dir = join(FIXTURES_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await fn(dir);
  console.log(`Created fixture: ${name}`);
}

async function sampleRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();

  mkdirSync(join(dir, "src"), { recursive: true });

  // Commit 1: Initial commit
  writeFileSync(join(dir, "README.md"), "# Sample Repo\n");
  writeFileSync(join(dir, "src", "index.ts"), "console.log('hello');\n");
  await git.add(".");
  await git.commit("Initial commit", { "--author": 'Alice <alice@test.com>' });

  // Commit 2: Add auth
  writeFileSync(join(dir, "src", "auth.ts"), "export function login() {}\n");
  writeFileSync(join(dir, "src", "index.ts"), "console.log('hello');\nimport { login } from './auth';\n");
  await git.add(".");
  await git.commit("Add auth module", { "--author": 'Bob <bob@test.com>' });

  // Commit 3: Fix JWT bug
  writeFileSync(join(dir, "src", "auth.ts"), "export function login(token: string) {}\n");
  await git.add(".");
  await git.commit("Fix JWT token validation", { "--author": 'Alice <alice@test.com>' });

  // Commit 4: Refactor auth
  mkdirSync(join(dir, "src", "utils"), { recursive: true });
  writeFileSync(join(dir, "src", "auth.ts"), "export function login(token: string): boolean { return true; }\n");
  writeFileSync(join(dir, "src", "utils", "jwt.ts"), "export function verify(t: string) {}\n");
  await git.add(".");
  await git.commit("Refactor auth into utils", { "--author": 'Bob <bob@test.com>' });

  // Commit 5: Add Redis cache
  writeFileSync(join(dir, "src", "cache.ts"), "export class RedisCache {}\n");
  writeFileSync(join(dir, "README.md"), "# Sample Repo\n\nWith Redis cache.\n");
  await git.add(".");
  await git.commit("Add Redis cache layer", { "--author": 'Charlie <charlie@test.com>' });
}

async function mergeRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();

  writeFileSync(join(dir, "README.md"), "# Merge History\n");
  await git.add(".");
  await git.commit("Initial commit");

  const defaultBranch = (await git.branch()).current;

  // Create and commit on feature branch
  await git.checkoutLocalBranch("feature");
  writeFileSync(join(dir, "feature.ts"), "// feature work\n");
  await git.add(".");
  await git.commit("Feature work");

  // Commit on default branch
  await git.checkout(defaultBranch);
  writeFileSync(join(dir, "main.ts"), "// main work\n");
  await git.add(".");
  await git.commit("Main work");

  // Merge feature into default
  await git.merge(["feature"]);
}

async function tagsRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();

  writeFileSync(join(dir, "v1.txt"), "version 1\n");
  await git.add(".");
  await git.commit("v1");
  await git.addTag("v1.0.0");

  writeFileSync(join(dir, "v2.txt"), "version 2\n");
  await git.add(".");
  await git.commit("v2");
  await git.addTag("v1.1.0");

  writeFileSync(join(dir, "v3.txt"), "version 3\n");
  await git.add(".");
  await git.commit("v3");
  await git.addTag("v2.0.0");
}

async function branchesRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();

  writeFileSync(join(dir, "base.txt"), "base\n");
  await git.add(".");
  await git.commit("Initial commit");

  await git.checkoutLocalBranch("feature-a");
  writeFileSync(join(dir, "a.txt"), "a\n");
  await git.add(".");
  await git.commit("Feature A");

  const initialHash = (await git.log({ maxCount: 1 })).latest!.hash;
  await git.checkout(initialHash);
  await git.checkoutLocalBranch("feature-b");
  writeFileSync(join(dir, "b.txt"), "b\n");
  await git.add(".");
  await git.commit("Feature B");
}

async function renameRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();

  writeFileSync(join(dir, "old-name.ts"), "// old\n");
  await git.add(".");
  await git.commit("Add old-name.ts");

  await git.mv("old-name.ts", "new-name.ts");
  await git.commit("Rename old-name.ts to new-name.ts");
}

async function emptyRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();
}

async function allFixtures() {
  await createFixture("sample-repo", sampleRepo);
  await createFixture("merge-history", mergeRepo);
  await createFixture("tags", tagsRepo);
  await createFixture("branches", branchesRepo);
  await createFixture("rename-file", renameRepo);
  await createFixture("empty-repo", emptyRepo);
}

allFixtures().catch(console.error);
