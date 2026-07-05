#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { indexCommand } from "./commands/indexCmd.js";
import { analyzeCommand } from "./commands/analyze.js";
import { embedCommand } from "./commands/embed.js";
import { searchCommand } from "./commands/search.js";
import { askCommand } from "./commands/ask.js";

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
  .command("analyze")
  .description("Run AI analysis on indexed commits")
  .action(analyzeCommand);

program
  .command("embed")
  .description("Generate embeddings for analyzed commits")
  .action(embedCommand);

program
  .command("search")
  .description("Search indexed repository")
  .argument("[query]", "Search query")
  .action(searchCommand);

program
  .command("ask")
  .description("Ask questions about the repository")
  .argument("[question]", "Your question")
  .action(askCommand);

program.parse(process.argv);
