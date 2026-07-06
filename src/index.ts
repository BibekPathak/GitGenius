#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { indexCommand } from "./commands/indexCmd.js";
import { chunkCommand } from "./commands/chunk.js";
import { analyzeCommand } from "./commands/analyze.js";
import { embedCommand } from "./commands/embed.js";
import { searchCommand } from "./commands/search.js";
import { askCommand } from "./commands/ask.js";
import { evolutionCommand } from "./commands/evolution.js";
import { ownershipCommand } from "./commands/ownership.js";
import { hotspotsCommand } from "./commands/hotspots.js";
import { releaseCommand } from "./commands/release.js";
import { reportCommand } from "./commands/report.js";

const program = new Command();

program
  .name("gitgenius")
  .description("AI-powered Git repository intelligence")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize GitGenius in a repository")
  .argument("[directory]", "Target directory", process.cwd())
  .action(initCommand);

program
  .command("index")
  .description("Parse git history and store commits")
  .argument("[directory]", "Target directory", process.cwd())
  .action(indexCommand);

program
  .command("chunk")
  .description("Group indexed commits into chunks for AI analysis")
  .argument("[directory]", "Target directory", process.cwd())
  .option("-s, --size <number>", "Commits per chunk", "50")
  .action((dir, opts) => chunkCommand(dir, { size: parseInt(opts.size, 10) }));

program
  .command("analyze")
  .description("Run AI analysis on unanalyzed chunks")
  .argument("[directory]", "Target directory", process.cwd())
  .option("-r, --retry", "Retry failed chunks")
  .option("-m, --model <name>", "AI model name", "gemini-2.0-flash")
  .action((dir, opts) => analyzeCommand(dir, { retry: opts.retry ?? false, model: opts.model }));

program
  .command("embed")
  .description("Generate embeddings for analyzed chunks")
  .argument("[directory]", "Target directory", process.cwd())
  .option("-m, --model <name>", "Embedding model name", "text-embedding-004")
  .action((dir, opts) => embedCommand(dir, { model: opts.model }));

program
  .command("search")
  .description("Hybrid search (BM25 + vector) across commits")
  .argument("<query>", "Search query")
  .argument("[directory]", "Target directory")
  .option("-l, --limit <number>", "Max results", "10")
  .action((query, dir, opts) => searchCommand(query, dir, { limit: parseInt(opts.limit, 10) }));

program
  .command("ask")
  .description("Ask questions about your repository (RAG over git history)")
  .argument("<question>", "Your question")
  .argument("[directory]", "Target directory")
  .option("-m, --model <name>", "LLM model name", "gemini-2.0-flash")
  .action((question, dir, opts) => askCommand(question, dir, { model: opts.model }));

program
  .command("files")
  .description("List files by commit frequency or churn")
  .argument("[directory]", "Target directory")
  .option("-s, --sort <sort>", "Sort by 'commits' or 'churn'", "commits")
  .option("-l, --limit <number>", "Max results", "20")
  .action((dir, opts) => evolutionCommand(dir, { sort: opts.sort, limit: parseInt(opts.limit, 10) }));

program
  .command("file")
  .description("Show timeline for a specific file")
  .argument("<path>", "File path")
  .argument("[directory]", "Target directory")
  .action((filePath, dir) => evolutionCommand(dir, { file: filePath }));

program
  .command("ownership")
  .description("Show developer contributions, file ownership, and bus factor")
  .argument("[directory]", "Target directory")
  .action((dir) => ownershipCommand(dir));

program
  .command("hotspots")
  .description("Find high-churn, high-risk files")
  .argument("[directory]", "Target directory")
  .action((dir) => hotspotsCommand(dir));

program
  .command("release")
  .description("Generate release notes between two tags/refs")
  .argument("<from>", "Starting ref (tag or commit hash)")
  .argument("<to>", "Ending ref (tag or commit hash)")
  .argument("[directory]", "Target directory")
  .action((from, to, dir) => releaseCommand(from, to, dir));

program
  .command("report")
  .description("Generate repository report")
  .argument("[directory]", "Target directory")
  .option("-f, --format <format>", "Output format: markdown, html, json, csv", "markdown")
  .action((dir, opts) => reportCommand(dir, opts.format));

program.parse(process.argv);
