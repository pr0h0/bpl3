import { describe, expect, test } from "bun:test";
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
});
