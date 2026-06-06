import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

describe("Runtime build script", () => {
  test("supports CI-selected compiler and debug/release runtime builds", () => {
    const script = readFileSync(
      join(import.meta.dir, "../lib/build_runtime.sh"),
      "utf8",
    );

    expect(script).toContain('CC="${CC:-clang}"');
    expect(script).toContain(
      'BPL_RUNTIME_BUILD="${BPL_RUNTIME_BUILD:-release}"',
    );
    expect(script).toContain("debug)");
    expect(script).toContain("-O0");
    expect(script).toContain("-g3");
    expect(script).toContain("release)");
    expect(script).toContain("-O2");
    expect(script).toContain('"$CC" -c');
    expect(script).toContain('mktemp -d "${SCRIPT_DIR}/.runtime-build.XXXXXX"');
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain('-o "$TMP_OBJECT"');
    expect(script).toContain('ar rcs "$TMP_STATIC" "$TMP_OBJECT"');
    expect(script).toContain('mv -f "$TMP_OBJECT" runtime_support.o');
  });

  test("builds universal runtime support objects on macOS", () => {
    const script = readFileSync(
      join(import.meta.dir, "../lib/build_runtime.sh"),
      "utf8",
    );

    expect(script).toContain('"$CC" -c -arch x86_64');
    expect(script).toContain('"$CC" -c -arch arm64');
    expect(script).toContain(
      'lipo -create "$TMP_X86_OBJECT" "$TMP_ARM_OBJECT" -output "$TMP_OBJECT"',
    );
  });

  test("keeps named stack frame storage lazy to avoid default BSS bloat", () => {
    const source = readFileSync(
      join(import.meta.dir, "../lib/runtime_support.c"),
      "utf8",
    );

    expect(source).toContain("__bpl_ensure_frame_storage");
    expect(source).toContain("calloc(BPL_MAX_STACK_DEPTH");
    expect(source).toContain("static const char **__bpl_frame_names");
    expect(source).toContain("static const char **__bpl_frame_files");
    expect(source).toContain("static int32_t *__bpl_frame_lines");
    expect(source).not.toContain(
      "static const char *__bpl_frame_names[BPL_MAX_STACK_DEPTH]",
    );
    expect(source).not.toContain(
      "static const char *__bpl_frame_files[BPL_MAX_STACK_DEPTH]",
    );
    expect(source).not.toContain(
      "static int32_t __bpl_frame_lines[BPL_MAX_STACK_DEPTH]",
    );

    const objectPath = join(import.meta.dir, "../lib/runtime_support.o");
    const nm = spawnSync("nm", ["-S", "--size-sort", objectPath], {
      encoding: "utf8",
    });
    if (nm.error || nm.status !== 0) {
      return;
    }

    const frameStorageSymbols = nm.stdout
      .split("\n")
      .filter((line) => /__bpl_frame_(names|files|lines)$/.test(line));
    expect(frameStorageSymbols).toHaveLength(3);
    for (const line of frameStorageSymbols) {
      const fields = line.trim().split(/\s+/);
      expect(Number.parseInt(fields[1] ?? "0", 16)).toBeLessThanOrEqual(8);
    }
  });
});
