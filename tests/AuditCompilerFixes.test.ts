import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { compileAndRun } from "./helpers/compileAndRun";

// Regressions for compiler defects found by the 2026-10-28 audit (docs/project/BUGS.md).
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

describe("BUG-436: switch diagnostics and null strings", () => {
  test("a duplicate enum case names the variant", () => {
    const result = check(`enum E { A, B }
frame main() ret int {
    local e: E = E.A;
    switch (e) {
        case E.A: { return 1; }
        case E.A: { return 2; }
        default: { return 0; }
    }
    return 0;
}
`);
    expect(result.stderr).toContain("Duplicate case value 'E.A'");
  });

  test("a null string takes the default case", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
frame pick(s: string) {
    switch (s) {
        case "a": { printf("a\\n"); break; }
        default: { printf("default\\n"); break; }
    }
}
frame main() ret int {
    pick(nullptr);
    pick("a");
    return 0;
}
`);
    expect(output).toBe("default\na\n");
  });
});

// spec: R-FN-10
describe("BUG-430: native variadic methods", () => {
  for (const [kind, source] of Object.entries({
    struct:
      "struct S { b: int, frame add(this: *S, xs: ...int, n: int) ret int { return n; } }",
    spec: "spec Sp { frame add(this: *Self, xs: ...int, n: int) ret int; }",
    enum: "enum E { A, frame add(this: *E, xs: ...int, n: int) {} }",
  })) {
    test(`are rejected on ${kind} methods`, () => {
      const result = check(source + MAIN);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("BPL_VARIADIC_METHOD_UNSUPPORTED");
    });
  }

  test("a variadic function value shows it is variadic in mismatches", () => {
    const result = check(`frame add(xs: ...int, n: int) ret int { return n; }
frame main() ret int {
    local f: Func<int>(*int, int) = add;
    return f(nullptr, 0);
}
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "cannot assign Func<i32>(*i32, i32, ...) to Func<i32>(*i32, i32)",
    );
  });
});

// spec: R-FN-9
describe("BUG-435: generic spec methods on a constrained type parameter", () => {
  test("binds Self to the parameter, including Self-returning methods", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
spec Getter<T> { frame get(this: *Self) ret T; frame twice(this: *Self) ret Self; }
struct Box: Getter<long> {
    v: long,
    frame get(this: *Box) ret long { return this.v; }
    frame twice(this: *Box) ret Box { return Box { v: this.v * 2 }; }
}
frame use<T: Getter<long>>(x: *T) ret long {
    local d: T = x.twice();
    return x.get() + d.get();
}
frame main() ret int {
    local b: Box = Box { v: 7 };
    printf("%ld\\n", use<Box>(&b));
    return 0;
}
`);
    expect(output).toBe("21\n");
  });

  test("rejects a spec method used as a value, which cannot be bound", () => {
    const result = check(`spec G<V> { frame get(this: *Self) ret V; }
struct B: G<long> { v: long, frame get(this: *B) ret long { return this.v; } }
frame use<T: G<long>>(x: *T) ret long {
    local f: Lambda<long>() = x.get;
    return f();
}
frame main() ret int {
    local b: B = B { v: 2 };
    return cast<int>(use<B>(&b));
}
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cannot use spec method 'get' as a value");
  });

  test("rejects overloaded spec methods (BUG-470)", () => {
    const result =
      check(`spec G { frame m(this: *Self) ret long; frame m(this: *Self, d: int) ret long; }
struct B: G {
    v: long,
    frame m(this: *B) ret long { return this.v; }
    frame m(this: *B, d: int) ret long { return this.v + cast<long>(d); }
}
frame use<T: G>(x: *T) ret long {
    local f: Lambda<long>() = x.m;
    return f() + x.m() + x.m(1);
}
frame main() ret int {
    local b: B = B { v: 2 };
    return cast<int>(use<B>(&b));
}
`);
    expect(result.status).toBe(1);
    // Spec methods cannot be overloaded at all (BUG-470).
    expect(result.stderr).toContain("Duplicate method 'm' in spec 'G'");
  });
});

// spec: R-EXPR-5
describe("BUG-467: parenthesized assignment targets", () => {
  test("assign like the unparenthesized target", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
frame main() ret int {
    local v: int = 1;
    local p: *int = &v;
    (*p) = 5;
    (v) += 2;
    ((*p)) *= 3;
    local a: int[2] = [1, 2];
    (a[1]) = 9;
    printf("%d %d\\n", v, a[1]);
    return 0;
}
`);
    expect(output).toBe("21 9\n");
  });

  test("still reject parenthesized non-lvalues", () => {
    const result = check(`frame main() ret int { (1 + 2) = 3; return 0; }`);
    expect(result.stderr).toContain("BPL_ASSIGNMENT_TARGET_INVALID");
  });

  test("reject an assignment as a target, but keep chains", () => {
    const result = check(
      `frame main() ret int { local x: int = 0; (x = 1) = 2; return x; }`,
    );
    expect(result.stderr).toContain("BPL_ASSIGNMENT_TARGET_INVALID");
    const output = compileAndRun(`import printf from "std/c.bpl";
frame main() ret int {
    local x: int = 0;
    local y: int = 0;
    x = y = 7;
    printf("%d %d\\n", x, y);
    return 0;
}
`);
    expect(output).toBe("7 7\n");
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
    "second instantiation of a generic":
      "struct Box<T> { v: T, }\nstruct S { a: Box<int>, b: Box<S>, }",
    "nested generic argument":
      "struct Box<T> { v: T, }\nstruct Pair<A, B> { a: A, b: B, }\nstruct W<T> { p: Box<Pair<T, int>>, }\nstruct S { w: W<S>, }",
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

  test("terminates on a generic that grows its own arguments", () => {
    const result = check(`struct Box<T> { v: T, }
struct G<T> { n: G<Box<T>>, }
struct S { g: G<int>, }${MAIN}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Struct 'G' has infinite size");
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

  test("wraps each operation to its type and applies every cast", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
global A: int = (2147483647 + 1) / 2;
global B: int = cast<int>(1.75);
global C: int = cast<int>(-2.5);
global D: u8 = cast<u8>(300);
global E: double = cast<double>(cast<f32>(0.1));
global F: long = cast<long>(2147483647) + 1;
frame main() ret int {
    printf("%d %d %d %d %.10f %ld\\n", A, B, C, cast<int>(D), E, F);
    return 0;
}
`);
    expect(output).toBe("-1073741824 1 -2 44 0.1000000015 2147483648\n");
  });

  test("converts the right operand, saturates float casts, resolves aliases", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
type Byte = u8;
global A: u8 = cast<u8>(200) / -2;
global B: Byte = cast<Byte>(150) + cast<Byte>(128);
global C: i8 = cast<i8>(300.0);
global D: u8 = cast<u8>(-5.0);
frame main() ret int {
    printf("%d %d %d %d\\n", cast<int>(A), cast<int>(B), cast<int>(C), cast<int>(D));
    return 0;
}
`);
    // The same expressions evaluated at run time give the same values.
    expect(output).toBe("0 22 127 0\n");
  });

  test("folds bool casts by the low bit and only null pointer casts", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
global A: bool = cast<bool>(2);
global B: bool = cast<bool>(3);
global P: *int = cast<*int>(0);
frame main() ret int {
    printf("%d %d %d\\n", cast<int>(A), cast<int>(B), cast<int>(P == nullptr));
    return 0;
}
`);
    expect(output).toBe("0 1 1\n");
    const address = check(`global P: *int = cast<*int>(16);${MAIN}`);
    expect(address.stderr).toContain("BPL_GLOBAL_INITIALIZER_NOT_CONSTANT");
  });

  test("keeps the sign of a negative zero double global (found by the oracle fuzzer)", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
global G: double = -(0.0);
global H: double = -0.0;
frame main() ret int {
    printf("%llx %llx\\n", *cast<*ulong>(&G), *cast<*ulong>(&H));
    return 0;
}
`);
    expect(output).toBe("8000000000000000 8000000000000000\n");
  });

  test("folds casts of bool constants (found by the oracle fuzzer)", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
global A: int = ~((cast<int>(false) & 7) + 1);
global B: u8 = cast<u8>(true) + cast<u8>(true);
global C: bool = cast<bool>(cast<int>(true));
frame main() ret int {
    printf("%d %d %d\\n", A, cast<int>(B), cast<int>(C));
    return 0;
}
`);
    expect(output).toBe("-2 2 1\n");
  });

  test("rejects a signed division that overflows", () => {
    const result = check(`global X: int = (-2147483647 - 1) / -1;${MAIN}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BPL_GLOBAL_INITIALIZER_NOT_CONSTANT");
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

// `bpl check` accepted these and either failed at build time or produced a
// program that silently matched nothing.
// spec: R-CTRL-7
describe("switch case values are constants", () => {
  test("a variable case is rejected by the checker", () => {
    const result = check(`frame main() ret int {
    local x: int = 1;
    local y: int = 1;
    switch (x) { case y: { return 1; } default: { return 0; } }
}`);
    expect(result.stderr).toContain("BPL_SWITCH_CASE_VALUE_NOT_CONSTANT");
  });

  test("character, negative and enum labels still work", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
enum Message { Move(int, int), Quit, }
frame main() ret int {
    local c: char = 'b';
    switch (c) { case 'a': { break; } case 'b': { printf("b "); break; } default: { break; } }
    local n: int = -1;
    switch (n) { case -1: { printf("neg "); break; } default: { break; } }
    local m: Message = Message.Move(1, 2);
    switch (m) { case Message.Move: { printf("move\\n"); break; } default: { break; } }
    return 0;
}
`);
    expect(output).toBe("b neg move\n");
  });

  test("duplicate character labels are reported as written", () => {
    const result = check(`frame main() ret int {
    local c: char = 'a';
    switch (c) { case 'a': { break; } case 'a': { break; } default: { break; } }
    return 0;
}`);
    expect(result.stderr).toContain("Duplicate case value ''a''");
  });
});

// spec: R-ENUM-1
describe("data-carrying enum variants need their data", () => {
  test("a tuple variant without arguments is rejected", () => {
    const result = check(`enum Message { Move(int, int), Quit, }
frame main() ret int {
    local m: Message = Message.Move;
    match (m) { Message.Quit => { return 1; }, _ => { return 0; }, }
}`);
    expect(result.stderr).toContain("BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH");
    expect(result.stderr).toContain("Usage: Message.Move(int, int)");
  });
});

// spec: R-MATCH-3
describe("match coverage and unreachable arms", () => {
  test("a refutable variant arm does not cover its variant", () => {
    const result = check(`enum Message { Move(int, int), Quit, }
frame f(m: Message) ret int {
    return match (m) { Message.Move(1, y) => y, Message.Quit => 0, };
}${MAIN}`);
    expect(result.stderr).toContain("missing variants: Move");
  });

  test("a refutable arm followed by a covering arm runs", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
enum Message { Move(int, int), Quit, }
frame f(m: Message) ret int {
    return match (m) {
        Message.Move(1, y) => y,
        Message.Move(x, y) => x + y,
        Message.Quit => 0,
    };
}
frame main() ret int {
    printf("%d %d\\n", f(Message.Move(1, 7)), f(Message.Move(5, 9)));
    return 0;
}
`);
    expect(output).toBe("7 14\n");
  });

  test("nested arms cover a variant together", () => {
    const covered = check(`enum Flag { On(bool), Off, }
frame f(x: Flag) ret int {
    return match (x) { Flag.On(true) => 1, Flag.On(false) => 2, Flag.Off => 3, };
}${MAIN}`);
    expect(covered.stderr).toBe("");
    const partial = check(`enum Flag { On(bool), Off, }
frame f(x: Flag) ret int {
    return match (x) { Flag.On(true) => 1, Flag.Off => 3, };
}${MAIN}`);
    expect(partial.stderr).toContain("missing variants: On");
    // Once the arms cover On together, a further On arm is dead.
    const dead = check(`enum Flag { On(bool), Off, }
frame f(x: Flag) ret int {
    return match (x) { Flag.On(true) => 1, Flag.On(false) => 2, Flag.On(b) => 4, Flag.Off => 3, };
}${MAIN}`);
    expect(dead.stderr).toContain(
      "Unreachable match arm: variant 'On' is already matched by earlier arms",
    );
  });

  test("coverage of many independent literal columns stays fast", () => {
    // Each arm tests one bool field; splitting on all of them without the
    // irrefutable-row shortcut is exponential in the number of fields.
    const n = 26;
    const wild = Array<string>(n).fill("_");
    const arms = wild.map((_, i) => {
      const patterns = [...wild];
      patterns[i] = "true";
      return `W.V(${patterns.join(", ")}) => ${i},`;
    });
    const result =
      check(`enum W { V(${Array<string>(n).fill("bool").join(", ")}), Z, }
frame f(w: W) ret int {
    return match (w) { ${arms.join(" ")} W.V(${wild.join(", ")}) => 99, W.Z => -1, };
}${MAIN}`);
    expect(result.stderr).toBe("");
  });

  test("an identifier arm cannot stand for the whole enum value", () => {
    // It was never selected: the value fell through to later arms.
    const result = check(`enum Message { Move(int, int), Quit, }
frame f(m: Message) ret int {
    return match (m) { Message.Quit => 0, other => 7, _ => 9, };
}${MAIN}`);
    expect(result.stderr).toContain(
      "An enum match cannot bind the whole value to 'other'",
    );
  });

  test("arms after a covering arm or an unguarded _ are rejected", () => {
    const repeated = check(`enum Color { Red, Green, }
frame f(c: Color) ret int {
    return match (c) { Color.Red => 1, Color.Red => 2, Color.Green => 3, };
}${MAIN}`);
    expect(repeated.stderr).toContain(
      "Unreachable match arm: variant 'Red' is already matched",
    );
    const afterWildcard = check(`enum Color { Red, Green, }
frame f(c: Color) ret int {
    return match (c) { _ => 0, Color.Red => 1, };
}${MAIN}`);
    expect(afterWildcard.stderr).toContain("an earlier '_' arm matches");
    // A guarded arm covers nothing, so the same variant may follow it.
    const guarded = check(`enum Color { Red, Green, }
frame f(c: Color, k: int) ret int {
    return match (c) { Color.Red if k > 0 => 1, Color.Red => 2, Color.Green => 3, };
}${MAIN}`);
    expect(guarded.stderr).toBe("");
  });
});

describe("BUG-473: Lambda to Func casts", () => {
  test("bpl check rejects the cast at its own location", () => {
    const result = check(`frame main() ret int {
    local l: Lambda<int>(int) = |x: int| ret int { return x; };
    local f: Func<int>(int) = cast<Func<int>(int)>(l);
    return f(0);
}
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "error[BPL_CAST_INVALID][main.bpl:3:31]: Cannot cast Lambda to Func",
    );
  });
});
