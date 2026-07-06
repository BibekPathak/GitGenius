import chalk from "chalk";
import { existsSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findRepoRoot, NotAGitRepoError } from "../utils/repoRoot.js";
import { dbPath, configPath, reportsDir } from "../utils/paths.js";
import { getPrisma, closePrisma } from "../db/client.js";
import { getRepository } from "../db/queries.js";
import { collectReportData } from "../reports/index.js";
import { renderMarkdown } from "../reports/formats/markdown.js";
import { renderHtml } from "../reports/formats/html.js";
import { renderJson } from "../reports/formats/json.js";
import { renderCsv } from "../reports/formats/csv.js";
import { spinner } from "../utils/spinner.js";

type Format = "markdown" | "html" | "json" | "csv";

export async function reportCommand(dir?: string, format: Format = "markdown"): Promise<void> {
  const targetDir = dir ?? process.cwd();
  const sp = spinner(`Generating ${format} report...`).start();

  let repoRoot: string;
  try {
    repoRoot = findRepoRoot(targetDir);
  } catch (e) {
    if (e instanceof NotAGitRepoError) { sp.fail(chalk.red("Not a git repository")); throw e; }
    throw e;
  }

  const db = dbPath(repoRoot);
  if (!existsSync(db)) { sp.fail(chalk.red("Not initialized")); throw new Error("Not initialized"); }

  const prisma = getPrisma(db);
  const repo = await getRepository(prisma, repoRoot);
  if (!repo) { sp.fail(chalk.red("Repo not found")); await closePrisma(); throw new Error("Not found"); }

  const data = await collectReportData(prisma, repo.id);
  await closePrisma();

  const extMap: Record<Format, string> = { markdown: "md", html: "html", json: "json", csv: "csv" };
  const renderers: Record<Format, (d: typeof data) => string> = {
    markdown: renderMarkdown,
    html: renderHtml,
    json: renderJson,
    csv: renderCsv,
  };

  const output = renderers[format](data);
  const filename = `report-${repo.name}-${new Date().toISOString().split("T")[0]}.${extMap[format]}`;
  const outPath = join(reportsDir(repoRoot), filename);
  writeFileSync(outPath, output);

  sp.succeed(chalk.green(`${format} report saved`));
  console.log(`  ${chalk.dim("File:")} ${outPath}`);
  console.log(`  ${chalk.dim("Size:")} ${(Buffer.byteLength(output) / 1024).toFixed(1)} KB`);
}
