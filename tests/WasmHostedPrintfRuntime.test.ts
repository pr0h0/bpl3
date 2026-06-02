import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const RUNTIME_WASM_HOST = resolve(
  import.meta.dir,
  "../lib/runtime_wasm_host.ll",
);
const COMPILER_OPTIONS_DOC = resolve(
  import.meta.dir,
  "../docs/39-compiler-options.md",
);

describe("Hosted wasm printf runtime IR", () => {
  test("contains the hosted formatting helpers for the supported subset", () => {
    const runtime = readFileSync(RUNTIME_WASM_HOST, "utf8");

    expect(runtime).toContain("define internal i32 @__bpl_host_vformat");
    expect(runtime).toContain("define internal i32 @__bpl_host_write_cstr");
    expect(runtime).toContain(
      "define internal i32 @__bpl_host_write_i32_decimal",
    );
    expect(runtime).toContain(
      "define internal i32 @__bpl_host_write_i32_decimal_width",
    );
    expect(runtime).toContain("define internal i32 @__bpl_host_write_i32_hex");
    expect(runtime).toContain("declare void @llvm.va_start(i8*)");
    expect(runtime).toContain("declare void @llvm.va_end(i8*)");
  });

  test("compiles the hosted runtime IR to a wasm object", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-hosted-runtime-ir-"));
    const objectPath = join(dir, "runtime_wasm_host.o");

    try {
      const result = spawnSync(
        "clang",
        [
          "--target=wasm32-unknown-unknown",
          "-c",
          RUNTIME_WASM_HOST,
          "-o",
          objectPath,
        ],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 8,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(readFileSync(objectPath).subarray(0, 4).toString("binary")).toBe(
        "\0asm",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("documents hosted formatting edge-case behavior", () => {
    const docs = readFileSync(COMPILER_OPTIONS_DOC, "utf8");

    expect(docs).toContain("null `%s`");
    expect(docs).toContain("arguments print `(null)`");
    expect(docs).toContain("a dangling `%` prints as `%`");
    expect(docs).toContain("unsupported specifiers");
    expect(docs).toContain("do not consume varargs");
    expect(docs).toContain("one-digit `%Nd` and `%0Nd` integer widths");
  });
});
