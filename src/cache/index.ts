import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  key: string;
  data: T;
  createdAt: number;
  expiresAt: number;
}

export class FileCache {
  private dir: string;

  constructor(cacheDir: string) {
    this.dir = cacheDir;
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private hash(input: string): string {
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  }

  private path(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  get<T>(key: string): T | null {
    const filePath = this.path(key);
    if (!existsSync(filePath)) return null;

    try {
      const raw = readFileSync(filePath, "utf-8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() > entry.expiresAt) {
        unlinkSync(filePath);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    const entry: CacheEntry<T> = {
      key,
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    writeFileSync(this.path(key), JSON.stringify(entry));
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  getOrSet<T>(key: string, fn: () => T, ttlMs?: number): T {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const data = fn();
    this.set(key, data, ttlMs);
    return data;
  }

  async getOrSetAsync<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fn();
    this.set(key, data, ttlMs);
    return data;
  }

  contentHash(input: string): string {
    return this.hash(input);
  }

  clear(pattern?: string): number {
    let count = 0;
    const files = readdirSync(this.dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      if (pattern && !file.includes(pattern)) continue;
      unlinkSync(join(this.dir, file));
      count++;
    }
    return count;
  }

  clearAll(): number {
    let count = 0;
    const files = readdirSync(this.dir);
    for (const file of files) {
      const fullPath = join(this.dir, file);
      try {
        unlinkSync(fullPath);
        count++;
      } catch { /* skip */ }
    }
    return count;
  }

  stats(): { entries: number; sizeKB: number } {
    let entries = 0;
    let totalBytes = 0;
    const files = readdirSync(this.dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      entries++;
      try {
        totalBytes += readFileSync(join(this.dir, file)).length;
      } catch { /* skip */ }
    }
    return { entries, sizeKB: Math.round(totalBytes / 1024) };
  }
}
