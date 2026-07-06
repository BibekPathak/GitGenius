import { describe, it, expect } from "vitest";
import { indexCommand } from "../src/commands/indexCmd.js";
import { collectReportData } from "../src/reports/index.js";
import { renderPdf } from "../src/reports/formats/pdf.js";
import { renderMarkdown } from "../src/reports/formats/markdown.js";
import { renderHtml } from "../src/reports/formats/html.js";
import { renderJson } from "../src/reports/formats/json.js";
import { renderCsv } from "../src/reports/formats/csv.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

describe("export", () => {
  async function getData(repoDir: string) {
    await indexCommand(repoDir);
    const prisma = getPrisma(dbPath(repoDir));
    const repo = await prisma.repository.findFirstOrThrow();
    const data = await collectReportData(prisma, repo.id);
    await closePrisma();
    return data;
  }

  it("renders PDF from report data", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      const data = await getData(repoDir);
      const pdf = await renderPdf(data);
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
      // PDF header magic bytes
      expect(pdf[0]).toBe(0x25); // %
      expect(pdf[1]).toBe(0x50); // P
      expect(pdf[2]).toBe(0x44); // D
      expect(pdf[3]).toBe(0x46); // F
    });
  });

  it("renders markdown export", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      const data = await getData(repoDir);
      const md = renderMarkdown(data);
      expect(md).toContain("# Repository Report");
      expect(md).toContain("Total Commits");
    });
  });

  it("renders HTML export", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      const data = await getData(repoDir);
      const html = renderHtml(data);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Repository Report");
    });
  });

  it("renders JSON export", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      const data = await getData(repoDir);
      const json = renderJson(data);
      const parsed = JSON.parse(json);
      expect(parsed.totalCommits).toBe(5);
    });
  });

  it("renders CSV export", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      const data = await getData(repoDir);
      const csv = renderCsv(data);
      expect(csv).toContain("author,commits");
    });
  });

  it("handles empty repo for all formats", async () => {
    await withFixture("empty-repo", async (repoDir) => {
      const data = await getData(repoDir);
      expect(renderMarkdown(data)).toContain("0");
      expect(renderHtml(data)).toContain("0");
      expect(JSON.parse(renderJson(data)).totalCommits).toBe(0);
      expect(renderCsv(data)).toContain("overview");
    });
  });
});
