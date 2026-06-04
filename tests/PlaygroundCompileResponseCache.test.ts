import { describe, expect, test } from "bun:test";

import {
  CompileOnlyResponseCache,
  getCompileOnlyResponseCacheKey,
} from "../playground/backend/compileResponseCache";

describe("Playground compile-only response cache", () => {
  test("stores successful compile-only responses as immutable copies", () => {
    const cache = new CompileOnlyResponseCache({
      maxEntries: 2,
      ttlMs: 1_000,
      now: () => 10,
    });
    const key = getCompileOnlyResponseCacheKey({
      code: "frame main() ret int { return 0; }",
      bplHome: "/opt/bpl",
      includeArtifacts: true,
    });
    const response = {
      success: true,
      warnings: ["warning"],
      ir: "define i32 @main() { ret i32 0 }",
      ast: '{"kind":"Program"}',
      tokens: "[]",
    };

    expect(cache.remember(key, response)).toBe(true);
    response.warnings[0] = "mutated warning";

    const cached = cache.get(key);
    expect(cached).toEqual({
      success: true,
      warnings: ["warning"],
      ir: "define i32 @main() { ret i32 0 }",
      ast: '{"kind":"Program"}',
      tokens: "[]",
    });

    cached!.warnings![0] = "mutated cached warning";
    expect(cache.get(key)?.warnings?.[0]).toBe("warning");
  });

  test("keeps failures out of cache and expires stale responses", () => {
    let now = 100;
    const cache = new CompileOnlyResponseCache({
      maxEntries: 2,
      ttlMs: 50,
      now: () => now,
    });
    const key = getCompileOnlyResponseCacheKey({
      code: "source",
      bplHome: "/opt/bpl",
      includeArtifacts: false,
    });

    expect(cache.remember(key, { success: false, error: "compile failed" })).toBe(
      false,
    );
    expect(cache.get(key)).toBeUndefined();

    expect(cache.remember(key, { success: true, warnings: ["ok"] })).toBe(true);
    expect(cache.get(key)?.success).toBe(true);
    now = 151;
    expect(cache.get(key)).toBeUndefined();
  });

  test("keys identical source by BPL home and artifact mode", () => {
    const code = "frame main() ret int { return 0; }";

    expect(
      getCompileOnlyResponseCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        includeArtifacts: true,
      }),
    ).toBe(
      getCompileOnlyResponseCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        includeArtifacts: true,
      }),
    );
    expect(
      getCompileOnlyResponseCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        includeArtifacts: true,
      }),
    ).not.toBe(
      getCompileOnlyResponseCacheKey({
        code,
        bplHome: "/opt/bpl-b",
        includeArtifacts: true,
      }),
    );
    expect(
      getCompileOnlyResponseCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        includeArtifacts: true,
      }),
    ).not.toBe(
      getCompileOnlyResponseCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        includeArtifacts: false,
      }),
    );
  });
});
