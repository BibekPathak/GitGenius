import { describe, it, expect } from "vitest";
import { indexCommand } from "../src/commands/indexCmd.js";
import { getDeveloperStats, getFileOwners, computeBusFactor } from "../src/ownership/index.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

describe("ownership", () => {
  it("returns developer stats sorted by commit count", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const devs = await getDeveloperStats(prisma, repo.id);
      await closePrisma();

      expect(devs.length).toBe(3);
      expect(devs[0]!.authorName).toBe("Alice");
      expect(devs[1]!.authorName).toBe("Bob");
      expect(devs[2]!.authorName).toBe("Charlie");
    });
  });

  it("computes bus factor correctly", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const devs = await getDeveloperStats(prisma, repo.id);
      const bus = computeBusFactor(devs);
      await closePrisma();

      expect(bus.totalDevs).toBe(3);
      expect(bus.topContributors).toContain("Alice");
    });
  });
});
