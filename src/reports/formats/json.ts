import type { ReportData } from "../index.js";

export function renderJson(data: ReportData): string {
  return JSON.stringify(data, null, 2);
}
