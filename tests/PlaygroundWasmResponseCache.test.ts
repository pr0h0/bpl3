import { describe, expect, test } from "bun:test";

import {
  getHostedWasmCacheKey,
  HostedWasmResponseCache,
} from "../playground/backend/wasmResponseCache";

describe("Playground hosted wasm response cache", () => {
  test("stores successful hosted wasm responses as immutable copies", () => {
    const cache = new HostedWasmResponseCache({
      maxEntries: 2,
      ttlMs: 1_000,
      now: () => 10,
    });
    const key = getHostedWasmCacheKey({
      code: "frame main() ret int { return 0; }",
      bplHome: "/opt/bpl",
      linker: "/usr/bin/wasm-ld",
    });
    const response = {
      success: true,
      wasmBase64: "AGFzbQ==",
      wasmBytes: 8,
      ir: "define i32 @main() { ret i32 0 }",
      imports: [{ module: "env", name: "__bpl_host_write", kind: "function" }],
      warnings: ["warning"],
    };

    expect(cache.remember(key, response)).toBe(true);
    response.imports[0]!.name = "mutated-before-read";
    response.warnings[0] = "mutated warning";

    const cached = cache.get(key);
    expect(cached).toEqual({
      success: true,
      wasmBase64: "AGFzbQ==",
      wasmBytes: 8,
      ir: "define i32 @main() { ret i32 0 }",
      imports: [{ module: "env", name: "__bpl_host_write", kind: "function" }],
      warnings: ["warning"],
    });

    cached!.imports![0]!.name = "mutated-after-read";
    cached!.warnings![0] = "mutated cached warning";
    expect(cache.get(key)?.imports?.[0]?.name).toBe("__bpl_host_write");
    expect(cache.get(key)?.warnings?.[0]).toBe("warning");
  });

  test("keeps failures out of cache and expires stale successful responses", () => {
    let now = 100;
    const cache = new HostedWasmResponseCache({
      maxEntries: 2,
      ttlMs: 50,
      now: () => now,
    });
    const key = getHostedWasmCacheKey({
      code: "source",
      bplHome: "/opt/bpl",
      linker: "/usr/bin/wasm-ld",
    });

    expect(cache.remember(key, { success: false, error: "compile failed" })).toBe(
      false,
    );
    expect(cache.get(key)).toBeUndefined();

    expect(cache.remember(key, { success: true, wasmBase64: "AA==" })).toBe(true);
    expect(cache.get(key)?.success).toBe(true);
    now = 151;
    expect(cache.get(key)).toBeUndefined();
  });

  test("keys identical source by BPL home and resolved linker", () => {
    const code = "frame main() ret int { return 0; }";

    expect(
      getHostedWasmCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        linker: "/usr/bin/wasm-ld",
      }),
    ).toBe(
      getHostedWasmCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        linker: "/usr/bin/wasm-ld",
      }),
    );
    expect(
      getHostedWasmCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        linker: "/usr/bin/wasm-ld",
      }),
    ).not.toBe(
      getHostedWasmCacheKey({
        code,
        bplHome: "/opt/bpl-b",
        linker: "/usr/bin/wasm-ld",
      }),
    );
    expect(
      getHostedWasmCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        linker: "/usr/bin/wasm-ld",
      }),
    ).not.toBe(
      getHostedWasmCacheKey({
        code,
        bplHome: "/opt/bpl-a",
        linker: "/opt/llvm/bin/wasm-ld",
      }),
    );
  });
});
