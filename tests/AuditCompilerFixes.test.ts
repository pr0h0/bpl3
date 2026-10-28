import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { compileAndRun } from "./helpers/compileAndRun";

// Regressions for compiler defects found by the 2026-10-28 audit (BUGS.md).
function check(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "bpl-audit-fixes-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const result = Bun.spawnSync(
      [process.execPath, resolve("index.ts"), "check", file],
      { env: { ...process.env, NO_COLOR: "1" } },
    );
    return { status: result.exitCode, stderr: result.stderr.toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const MAIN = "\nframe main() ret int { return 0; }\n";

describe("BUG-423: scalar return types of overrides and spec methods", () => {
  test("rejects a narrower scalar return type", () => {
    const result = check(`spec Sp { frame go(this: *Self) ret long; }
struct Impl: Sp { v: int, frame go(this: *Impl) ret bool { return true; } }
struct P { v: int, frame m(this: *P) ret long { return 1; } }
struct C: P { frame m(this: *C) ret char { return cast<char>(-1); } }${MAIN}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Method 'go' in struct 'Impl' has incorrect return type",
    );
    expect(result.stderr).toContain("Invalid override of method 'm'");
  });
});

describe("BUG-427: types that contain themselves by value", () => {
  const cycles: Record<string, string> = {
    "fixed array": "struct S { a: S[2], }",
    tuple: "struct S { t: (int, S), }",
    "generic argument": "struct Box<T> { v: T, }\nstruct S { b: Box<S>, }",
    alias: "type Row = S[2];\nstruct S { r: Row, }",
    "enum payload": "enum Opt { Some(S), None }\nstruct S { o: Opt, }",
    "parent struct": "struct P { q: C, }\nstruct C: P { x: int, }",
  };
  for (const [name, source] of Object.entries(cycles)) {
    test(`reports a cycle through a ${name}`, () => {
      const result = check(source + MAIN);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("BPL_TYPE_RECURSION_CYCLE");
    });
  }

  test("accepts indirection through pointers, slices and callables", () => {
    const result = check(`struct Box<T> { v: *T, }
struct S { b: Box<S>, s: S[], n: *S, f: Func<S>(S), }${MAIN}`);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("BUG-428 and BUG-431: spec and inherited static calls", () => {
  test("widens arguments of calls through a spec pointer", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
spec Sp { frame take(this: *Self, v: long) ret long; }
struct Impl: Sp { base: long, frame take(this: *Impl, v: long) ret long { return this.base + v; } }
frame main() ret int {
    local i: Impl = Impl { base: 5000000000 };
    local sp: *Sp = &i;
    local small: u8 = 7;
    printf("%ld %ld\\n", sp.take(300), sp.take(small));
    return 0;
}
`);
    expect(output).toBe("5000000300 5000000007\n");
  });

  test("calls statics inherited from plain and generic parents", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
struct Base { v: int, frame make(v: int) ret Base { return Base { v: v }; } }
struct Child: Base { frame hello(this: *Child) ret int { return 1; } }
struct GBase<T> { v: T, frame make(v: T) ret GBase<T> { return GBase<T> { v: v }; } }
struct GChild: GBase<long> { frame hello(this: *GChild) ret int { return 1; } }
frame main() ret int {
    local b: Base = Child.make(5);
    local g: GBase<long> = GChild.make(5000000000);
    printf("%d %ld\\n", b.v, g.v);
    return 0;
}
`);
    expect(output).toBe("5 5000000000\n");
  });
});
