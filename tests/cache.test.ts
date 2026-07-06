import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { FileCache } from "../src/cache/index.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-cache");

describe("FileCache", () => {
  let cache: FileCache;

  beforeEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    cache = new FileCache(TMP_DIR);
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("stores and retrieves values", () => {
    cache.set("key1", { hello: "world" });
    const result = cache.get<{ hello: string }>("key1");
    expect(result).toEqual({ hello: "world" });
  });

  it("returns null for missing keys", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("respects TTL", async () => {
    cache.set("short", "data", 1); // 1ms TTL
    // Wait for expiration
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get("short")).toBeNull();
  });

  it("getOrSet computes and caches", () => {
    let callCount = 0;
    const fn = () => { callCount++; return "computed"; };

    const r1 = cache.getOrSet("test", fn);
    const r2 = cache.getOrSet("test", fn);

    expect(r1).toBe("computed");
    expect(r2).toBe("computed");
    expect(callCount).toBe(1);
  });

  it("getOrSetAsync works with promises", async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return "async-result"; };

    const r1 = await cache.getOrSetAsync("async-test", fn);
    const r2 = await cache.getOrSetAsync("async-test", fn);

    expect(r1).toBe("async-result");
    expect(r2).toBe("async-result");
    expect(callCount).toBe(1);
  });

  it("contentHash produces consistent output", () => {
    const h1 = cache.contentHash("hello world");
    const h2 = cache.contentHash("hello world");
    const h3 = cache.contentHash("different");

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("clearAll removes all entries", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.stats().entries).toBe(3);
    const cleared = cache.clearAll();
    expect(cleared).toBe(3);
    expect(cache.stats().entries).toBe(0);
  });

  it("reports correct stats", () => {
    cache.set("a", "x".repeat(1000));
    cache.set("b", "y".repeat(2000));

    const stats = cache.stats();
    expect(stats.entries).toBe(2);
    expect(stats.sizeKB).toBeGreaterThan(0);
  });

  it("persists data to disk", () => {
    cache.set("persist", "disk-data");
    // Create a new cache instance pointing to same dir
    const cache2 = new FileCache(TMP_DIR);
    expect(cache2.get<string>("persist")).toBe("disk-data");
  });
});
