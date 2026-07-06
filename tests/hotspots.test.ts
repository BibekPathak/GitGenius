import { describe, it, expect } from "vitest";
import { indexCommand } from "../src/commands/indexCmd.js";
import { getHotspots } from "../src/hotspots/index.js";
import { getPrisma, closePrisma } from "../src/db/client.js";
import { dbPath } from "../src/utils/paths.js";
import { withFixture } from "./setup.js";

describe("hotspots", () => {
  it("returns files sorted by risk score", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const hotspots = await getHotspots(prisma, repo.id);
      await closePrisma();

      expect(hotspots.length).toBeGreaterThan(0);
      for (let i = 1; i < hotspots.length; i++) {
        expect(hotspots[i]!.riskScore).toBeLessThanOrEqual(hotspots[i - 1]!.riskScore);
      }
    });
  });

  it("computes risk factors correctly", async () => {
    await withFixture("sample-repo", async (repoDir) => {
      await indexCommand(repoDir);
      const prisma = getPrisma(dbPath(repoDir));
      const repo = await prisma.repository.findFirstOrThrow();
      const hotspots = await getHotspots(prisma, repo.id);
      await closePrisma();

      for (const h of hotspots) {
        expect(h.riskScore).toBeGreaterThanOrEqual(0);
        expect(h.riskScore).toBeLessThanOrEqual(100);
        expect(h.uniqueAuthors).toBeGreaterThan(0);
      }
    });
  });
});
