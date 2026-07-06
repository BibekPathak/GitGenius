import type { ReportData } from "../index.js";

export function renderCsv(data: ReportData): string {
  const lines: string[] = [];
  lines.push("section,key,value1,value2,value3");

  lines.push(`overview,repo_name,${data.repoName},,`);
  lines.push(`overview,total_commits,${data.totalCommits},,`);
  lines.push(`overview,total_files,${data.totalFiles},,`);
  lines.push(`overview,total_authors,${data.totalAuthors},,`);
  lines.push(`overview,period,${data.dateRange.earliest},${data.dateRange.latest},`);

  lines.push("author,commits,insertions,deletions");
  for (const a of data.commitsByAuthor) {
    lines.push(`${a.author},${a.count},${a.insertions},${a.deletions}`);
  }

  lines.push("month,commits");
  for (const m of data.commitsByMonth) {
    lines.push(`${m.month},${m.count}`);
  }

  lines.push("file,churn,commits");
  for (const f of data.filesByChurn) {
    lines.push(`${f.path},${f.churn},${f.commits}`);
  }

  return lines.join("\n");
}
