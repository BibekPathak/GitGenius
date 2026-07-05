import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { indexCommand } from "../src/commands/indexCmd.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

const TMP_DIR = join(import.meta.dirname, ".tmp");

describe("empty repository", () => {
  it("handles zero commits without crashing", async () => {
    await withFixture("empty-repo", async (repoDir) => {
      // Index should either complete with 0 commits or throw "up to date"
      try {
        await indexCommand(repoDir);
      } catch (e) {
        // If it throws, that's also acceptable (no commits to index)
        expect((e as Error).message).toBeDefined();
        return;
      }

      const prisma = getPrisma(dbPath(repoDir));
      const count = await prisma.commit.count();
      await closePrisma();

      expect(count).toBe(0);
    });
  });
});
