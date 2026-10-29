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

describe("BUG-424: subtyping stops at one pointer level", () => {
  const PRELUDE = `struct Animal { a: int, frame f(this: *Animal) {} }
struct Dog: Animal { d: int, }
frame takeSlice(_xs: Animal[]) {}
`;
  test("rejects double pointers and arrays of a subtype", () => {
    const result = check(`${PRELUDE}frame main() ret int {
    local d: Dog;
    local pd: *Dog = &d;
    local ppa: **Animal = &pd;
    local dogs: Dog[2];
    local animals: Animal[2] = dogs;
    takeSlice(dogs);
    return 0;
}
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("**Animal");
    expect(result.stderr).toContain("Animal[2]");
    expect(result.stderr).toMatch(/Animal\[\]/);
  });

  test("still accepts a value or a single pointer", () => {
    const result = check(`${PRELUDE}frame main() ret int {
    local d: Dog;
    local _pa: *Animal = &d;
    local _a: Animal = d;
    return 0;
}
`);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
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

describe("BUG-432: address-of temporaries", () => {
  for (const operand of [
    "&(x + 1)",
    "&one()",
    "&5",
    "&cast<long>(x)",
    "&(b ? x : x)",
  ]) {
    test(`rejects ${operand}`, () => {
      const result = check(`frame one() ret int { return 1; }
frame main() ret int {
    local x: int = 1;
    local b: bool = true;
    local _r: *void = cast<*void>(${operand});
    if (b) { return x; }
    return 0;
}
`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Cannot take the address of a temporary value",
      );
    });
  }

  test("accepts variables, fields, elements and dereferences", () => {
    const result = check(`struct Pt { x: int, y: int, }
frame get() ret *Pt { return nullptr; }
frame main() ret int {
    local arr: int[2] = [1, 2];
    local sl: int[] = arr;
    local pt: Pt = Pt { x: 1, y: 2 };
    local pp: *Pt = &pt;
    local a: *int = &arr[1];
    local f: *int = &pt.x;
    local g: *int = &pp.y;
    local h: *int = &(*pp).y;
    local i: *int = &sl[0];
    local j: *int = &get().x;
    if (a == f || g == h || i == j) { return 1; }
    return 0;
}
`);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("BUG-433: constant global initializers", () => {
  test("folds signed, logical, arithmetic, cast and array initializers", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
global A: int = -5;
global F: float = -1.5;
global B: bool = !true;
global S: int = 1 + 2 * 3;
global M: u8 = 1 << 7;
global ARR: int[3] = [1, -2, 3];
global FS: f32 = cast<f32>(2.5);
global const K: int = ~0;
frame main() ret int {
    printf("%d %.1f %d %d %d %d %d %d %.1f %d\\n", A, F, cast<int>(B), S, cast<int>(M),
        ARR[0], ARR[1], ARR[2], cast<float>(FS), K);
    return 0;
}
`);
    expect(output).toBe("-5 -1.5 0 7 128 1 -2 3 2.5 -1\n");
  });

  test("rejects runtime initializers without cascading errors", () => {
    const result = check(`frame f() ret int { return 1; }
global X: int = f();
frame main() ret int { return X; }
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BPL_GLOBAL_INITIALIZER_NOT_CONSTANT");
    expect(result.stderr).not.toContain("Undefined symbol");
  });
});
