import { createHash } from "crypto";

export interface HostedWasmImport {
  module: string;
  name: string;
  kind: string;
}

export interface HostedWasmCompileResponse {
  success: boolean;
  error?: string;
  wasmBase64?: string;
  wasmBytes?: number;
  ir?: string;
  imports?: HostedWasmImport[];
  warnings?: string[];
}

interface HostedWasmResponseCacheEntry {
  response: HostedWasmCompileResponse;
  createdAt: number;
  lastUsedAt: number;
}

export interface HostedWasmCacheKeyInput {
  code: string;
  bplHome: string;
  linker: string;
}

export interface HostedWasmResponseCacheOptions {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
}

const HOSTED_WASM_CACHE_KEY_VERSION = "bpl-playground-hosted-wasm-v1";

export function getHostedWasmCacheKey(input: HostedWasmCacheKeyInput): string {
  return createHash("sha256")
    .update(HOSTED_WASM_CACHE_KEY_VERSION)
    .update("\0")
    .update(input.bplHome)
    .update("\0")
    .update(input.linker)
    .update("\0")
    .update(input.code)
    .digest("hex");
}

export class HostedWasmResponseCache {
  private readonly entries = new Map<string, HostedWasmResponseCacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: HostedWasmResponseCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 16;
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  get(key: string): HostedWasmCompileResponse | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;

    if (this.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }

    entry.lastUsedAt = this.now();
    return cloneHostedWasmResponse(entry.response);
  }

  remember(key: string, response: HostedWasmCompileResponse): boolean {
    if (!response.success || this.maxEntries <= 0) return false;

    const now = this.now();
    this.entries.set(key, {
      response: cloneHostedWasmResponse(response),
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

function cloneHostedWasmResponse(
  response: HostedWasmCompileResponse,
): HostedWasmCompileResponse {
  return {
    ...response,
    imports: response.imports?.map((entry) => ({ ...entry })),
    warnings: response.warnings ? [...response.warnings] : undefined,
  };
}
