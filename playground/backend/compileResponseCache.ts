import { createHash } from "crypto";

export interface CompileOnlyResponse {
  success: boolean;
  output?: string;
  error?: string;
  warnings?: string[];
  ir?: string;
  ast?: string;
  tokens?: string;
}

interface CompileOnlyResponseCacheEntry {
  response: CompileOnlyResponse;
  createdAt: number;
  lastUsedAt: number;
}

export interface CompileOnlyResponseCacheKeyInput {
  code: string;
  bplHome: string;
  includeArtifacts: boolean;
}

export interface CompileOnlyResponseCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
}

const COMPILE_ONLY_CACHE_KEY_VERSION = "bpl-playground-compile-only-v1";

export function getCompileOnlyResponseCacheKey(
  input: CompileOnlyResponseCacheKeyInput,
): string {
  return createHash("sha256")
    .update(COMPILE_ONLY_CACHE_KEY_VERSION)
    .update("\0")
    .update(input.bplHome)
    .update("\0")
    .update(input.includeArtifacts ? "artifacts" : "no-artifacts")
    .update("\0")
    .update(input.code)
    .digest("hex");
}

export class CompileOnlyResponseCache {
  private readonly entries = new Map<string, CompileOnlyResponseCacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: CompileOnlyResponseCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 16;
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  get(key: string): CompileOnlyResponse | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;

    if (this.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }

    entry.lastUsedAt = this.now();
    return cloneCompileOnlyResponse(entry.response);
  }

  remember(key: string, response: CompileOnlyResponse): boolean {
    if (!response.success || this.maxEntries <= 0) return false;

    const now = this.now();
    this.entries.set(key, {
      response: cloneCompileOnlyResponse(response),
      createdAt: now,
      lastUsedAt: now,
    });
    this.evictOldestEntries();
    return this.entries.has(key);
  }

  size(): number {
    return this.entries.size;
  }

  private evictOldestEntries(): void {
    while (this.entries.size > this.maxEntries) {
      let oldestKey: string | undefined;
      let oldestUsedAt = Number.POSITIVE_INFINITY;

      for (const [key, entry] of this.entries) {
        if (entry.lastUsedAt < oldestUsedAt) {
          oldestKey = key;
          oldestUsedAt = entry.lastUsedAt;
        }
      }

      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}

function cloneCompileOnlyResponse(
  response: CompileOnlyResponse,
): CompileOnlyResponse {
  return {
    ...response,
    warnings: response.warnings ? [...response.warnings] : undefined,
  };
}
