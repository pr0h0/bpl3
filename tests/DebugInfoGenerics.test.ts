import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { compileAndRun } from "./helpers/compileAndRun";

// BUG-429: `--debug` must describe every local; a `type: null` local (an
// unsubstituted `T`, or a built-in struct such as `Any`) crashes clang.
describe("--debug with generic and built-in types", () => {
  test("generic locals of struct type", () => {
    const output = compileAndRun(
      `import printf from "std/c.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
frame main() ret int {
    local a: Array<String> = Array<String>.new(2);
    a.push(String.new("x"));
    local s: String = a.get(0);
    printf("%s\\n", s.cstr());
    a.destroy();
    return 0;
}
`,
      { args: ["--debug"] },
    );
    expect(output).toBe("x\n");
  });

  test("heterogeneous variadic Any locals", () => {
    const output = compileAndRun(
      `import printf from "std/c.bpl";
frame count(args: ...Any, n: int) {
    local i: int = 0;
    loop (i < n) {
        local v: Any = args[i];
        if (v is int) { printf("int\\n"); }
        i = i + 1;
    }
}
frame main() ret int {
    count(1, 2);
    return 0;
}
`,
      { args: ["--debug"] },
    );
    expect(output).toBe("int\nint\n");
  });
});

describe("lambda names", () => {
  test("lambdas at the same position in different files do not clash", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-lambda-names-"));
    try {
      // Capturing lambdas with different captures give the two context
      // structs different layouts, so a shared name is a type redefinition.
      const lambdaLine = (capture: string, value: string) =>
        `    local c: ${capture} = ${value};\n` +
        `    local f: Lambda<void>() = || { printf("%d\\n", cast<int>(c)); };\n`;
      writeFileSync(
        join(dir, "other.bpl"),
        `import printf from "std/c.bpl";
# Keeps the lambda on the same line and column as the one in main.bpl.
frame other() {
${lambdaLine("long", "2")}    f();
}
export other;
`,
      );
      writeFileSync(
        join(dir, "main.bpl"),
        `import printf from "std/c.bpl";
import other from "./other.bpl";
frame main() ret int {
${lambdaLine("char", "cast<char>(1)")}    f();
    other();
    return 0;
}
`,
      );
      const result = Bun.spawnSync(
        [process.execPath, resolve("index.ts"), "run", "main.bpl"],
        { cwd: dir },
      );
      expect(result.stderr.toString()).toBe("");
      expect(result.stdout.toString()).toBe("1\n2\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
