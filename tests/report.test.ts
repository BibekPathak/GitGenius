import { describe, it, expect } from "vitest";
import { indexCommand } from "../src/commands/indexCmd.js";
import { collectReportData } from "../src/reports/index.js";
import { renderMarkdown } from "../src/reports/formats/markdown.js";
import { renderHtml } from "../src/reports/formats/html.js";
import { renderJson } from "../src/reports/formats/json.js";
import { renderCsv } from "../src/reports/formats/csv.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

describe("reports", () => {
  it("collects report data from indexed repo", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const data = await collectReportData(prisma, repo.id);
      await closePrisma();

      expect(data.totalCommits).toBe(5);
      expect(data.totalAuthors).toBe(3);
      expect(data.totalFiles).toBeGreaterThan(0);
      expect(data.commitsByAuthor.length).toBe(3);
      expect(data.commitsByMonth.length).toBeGreaterThan(0);
    });
  });

  it("renders markdown report", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const data = await collectReportData(prisma, repo.id);
      await closePrisma();

      const md = renderMarkdown(data);
      expect(md).toContain("# Repository Report");
      expect(md).toContain("Total Commits");
      expect(md).toContain("Commits by Author");
    });
  });

  it("renders HTML report", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const data = await collectReportData(prisma, repo.id);
      await closePrisma();

      const html = renderHtml(data);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Repository Report");
    });
  });

  it("renders JSON report", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const data = await collectReportData(prisma, repo.id);
      await closePrisma();

      const json = renderJson(data);
      const parsed = JSON.parse(json);
      expect(parsed.totalCommits).toBe(5);
    });
  });

  it("renders CSV report", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const data = await collectReportData(prisma, repo.id);
      await closePrisma();

      const csv = renderCsv(data);
      expect(csv).toContain("author,commits");
      expect(csv).toContain("Alice");
    });
  });

  it("handles empty repo", async () => {
    await withFixture("empty-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const data = await collectReportData(prisma, repo.id);
      await closePrisma();

      expect(data.totalCommits).toBe(0);
      expect(data.totalAuthors).toBe(0);
    });
  });
});
