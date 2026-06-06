import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  resetPlaygroundNativeRuntimeFileCacheForTests,
  resolvePlaygroundNativeRuntimeFiles,
} from "../playground/backend/runtimeFiles";

function createRuntimeHome(): string {
  const root = mkdtempSync(join(tmpdir(), "bpl-playground-runtime-home-"));
  const libDir = join(root, "lib");
  writeFileSync(join(root, ".keep"), "");
  mkdirSync(libDir, { recursive: true });
  writeFileSync(join(libDir, "runtime.ll"), "define void @__bpl_stub() { ret void }\n");
  writeFileSync(join(libDir, "runtime_support.o"), "runtime support object\n");
  return root;
}

function createFakeCompiler(
  dir: string,
  behavior: "success" | "failure" = "success",
): { compiler: string; logPath: string } {
  const compiler = join(dir, `fake-clang-${behavior}.sh`);
  const logPath = join(dir, `${behavior}.log`);
  const script =
    behavior === "success"
      ? [
          "#!/bin/sh",
          `printf '%s\\n' \"$*\" >> ${JSON.stringify(logPath)}`,
          "out=''",
          "while [ $# -gt 0 ]; do",
          "  if [ \"$1\" = '-o' ]; then",
          "    shift",
          "    out=\"$1\"",
          "  fi",
          "  shift",
          "done",
          "printf 'cached runtime object\\n' > \"$out\"",
          "exit 0",
        ].join("\n")
      : [
          "#!/bin/sh",
          `printf '%s\\n' \"$*\" >> ${JSON.stringify(logPath)}`,
          "echo 'runtime compile failed' >&2",
          "exit 9",
        ].join("\n");

  writeFileSync(compiler, script);
  chmodSync(compiler, 0o755);
  return { compiler, logPath };
}

describe("Playground native runtime file resolution", () => {
  test("compiles runtime.ll to a reusable object file for repeated playground runs", async () => {
    resetPlaygroundNativeRuntimeFileCacheForTests();
    const dir = mkdtempSync(join(tmpdir(), "bpl-playground-runtime-cache-"));
    const bplHome = createRuntimeHome();
    const cacheDir = join(dir, "cache");
    const { compiler, logPath } = createFakeCompiler(dir);

    try {
      const first = await resolvePlaygroundNativeRuntimeFiles({
        bplHome,
        cacheDir,
        compiler,
        target: "aarch64-apple-darwin",
      });
      const second = await resolvePlaygroundNativeRuntimeFiles({
        bplHome,
        cacheDir,
        compiler,
        target: "aarch64-apple-darwin",
      });

      expect(first).toEqual(second);
      expect(first[0]).toStartWith(cacheDir);
      expect(first[0]).toEndWith(".o");
      expect(readFileSync(first[0]!, "utf8")).toBe("cached runtime object\n");
      expect(first[1]).toBe(join(bplHome, "lib", "runtime_support.o"));
      expect(readFileSync(logPath, "utf8").trim().split("\n")).toHaveLength(1);
      expect(readFileSync(logPath, "utf8")).toContain(
        "-target aarch64-apple-darwin",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(bplHome, { recursive: true, force: true });
      resetPlaygroundNativeRuntimeFileCacheForTests();
    }
  });

  test("falls back to runtime.ll when object precompilation is unavailable", async () => {
    resetPlaygroundNativeRuntimeFileCacheForTests();
    const dir = mkdtempSync(join(tmpdir(), "bpl-playground-runtime-fallback-"));
    const bplHome = createRuntimeHome();
    const cacheDir = join(dir, "cache");
    const { compiler } = createFakeCompiler(dir, "failure");
    const warnings: string[] = [];

    try {
      const files = await resolvePlaygroundNativeRuntimeFiles({
        bplHome,
        cacheDir,
        compiler,
        warn: (message) => warnings.push(message),
      });

      expect(files).toEqual([
        join(bplHome, "lib", "runtime.ll"),
        join(bplHome, "lib", "runtime_support.o"),
      ]);
      expect(warnings.join("\n")).toContain(
        "Falling back to runtime.ll because cached runtime object compilation failed",
      );
      expect(existsSync(cacheDir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(bplHome, { recursive: true, force: true });
      resetPlaygroundNativeRuntimeFileCacheForTests();
    }
  });
});
