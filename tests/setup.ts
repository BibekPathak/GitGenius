import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { createRepository } from "../src/db/queries.js";
import { dbPath, gitGeniusDir, configPath, GITGENIUS_SUBDIRS } from "../src/utils/paths.js";
import { writeFileSync, existsSync } from "node:fs";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

export function fixturePath(name: string): string {
  return join(FIXTURES_DIR, name);
}

export function copyFixture(name: string, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  cpSync(fixturePath(name), dest, { recursive: true });
}

export async function initRepo(repoDir: string): Promise<string> {
  const ggDir = gitGeniusDir(repoDir);
  if (!existsSync(ggDir)) {
    mkdirSync(ggDir, { recursive: true });
  }
  for (const subdir of GITGENIUS_SUBDIRS) {
    mkdirSync(join(ggDir, subdir), { recursive: true });
  }

  const db = dbPath(repoDir);
  runMigrations(db);

  const prisma = getPrisma(db);

  const repo = await createRepository(prisma, {
    path: repoDir,
    name: repoDir.split("/").pop() ?? "test",
    defaultBranch: "master",
    headCommit: "HEAD",
    gitVersion: "2.x",
  });

  const config = {
    repoRoot: repoDir,
    repoId: repo.id,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(configPath(repoDir), JSON.stringify(config, null, 2));

  await closePrisma();
  return db;
}

export async function getRepoId(repoDir: string): Promise<string> {
  const prisma = getPrisma(dbPath(repoDir));
  const repo = await prisma.repository.findUnique({ where: { path: repoDir } });
  await closePrisma();
  return repo!.id;
}

export async function withFixture<T>(
  fixture: string,
  fn: (repoDir: string, repoId: string) => Promise<T>
): Promise<T> {
  const tmpDir = join(import.meta.dirname, ".tmp", fixture);
  copyFixture(fixture, tmpDir);
  await initRepo(tmpDir);
  const repoId = await getRepoId(tmpDir);
  return fn(tmpDir, repoId);
}

export async function getCommitCount(repoDir: string): Promise<number> {
  const prisma = getPrisma(dbPath(repoDir));
  const count = await prisma.commit.count();
  await closePrisma();
  return count;
}
