import { describe, test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// The bugs left open by the conformance audit of 2026-11-10: BUG-501,
// BUG-530, BUG-543, BUG-544, BUG-548, and destructors across throws.

describe("open audit bugs: programs", () => {
  // spec: R-SPEC-4, R-FN-7, R-FN-8, R-EXC-2
  test("runs the fixed programs identically at O0 and O3", () => {
    expectCorrectnessSuite([
      {
        name: "spec-pointer-array-literals",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
spec Drawable { frame area(this: *Self) ret int; }
struct Ci : Drawable { r: int, frame area(this: *Ci) ret int { return this.r * 3; } }
struct Sq : Drawable { s: int, frame area(this: *Sq) ret int { return this.s * this.s; } }
frame total(items: *Drawable[2]) ret int { return items[0].area() + items[1].area(); }
frame main() ret int {
    local c: Ci = Ci { r: 2 };
    local s: Sq = Sq { s: 4 };
    local arr: *Drawable[2] = [&c, &c];
    arr = [&s, &c];
    printf("%d %d %d\\n", arr[0].area(), arr[1].area(), total([&c, &s]));
    return 0;
}
`,
        expectedStdout: "16 6 22\n",
      },
      {
        name: "overloaded-function-values",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
frame ov(_x: int) ret string { return "int"; }
frame ov(_x: long) ret string { return "long"; }
frame apply(f: Func<string>(long), v: long) ret string { return f(v); }
frame main() ret int {
    local f: Func<string>(long) = ov;
    local g: Func<string>(int) = ov;
    printf("%s %s\\n", f(cast<long>(1)), g(1));
    g = ov;
    printf("%s\\n", apply(ov, cast<long>(2)));
    return 0;
}
`,
        expectedStdout: "long int\nlong\n",
      },
      {
        name: "overloaded-function-value-targets",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
frame ov(_x: int) ret string { return "int"; }
frame ov(_x: long) ret string { return "long"; }
frame pick() ret Func<string>(long) { return ov; }
struct H { f: Func<string>(int), }
frame main() ret int {
    local l: Lambda<string>(long) = ov;
    local h: H = H { f: ov };
    local p: Func<string>(long) = pick();
    printf("%s %s %s\\n", l(cast<long>(1)), h.f(1), p(cast<long>(3)));
    return 0;
}
`,
        expectedStdout: "long int long\n",
      },
      {
        name: "explicit-generic-function-values",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
frame h<U>(x: int) ret int { return x + cast<int>(sizeof<U>()); }
frame g<U>(x: U) ret U { return x; }
frame main() ret int {
    local f: Func<int>(int) = h<long>;
    local q: Func<int>(int) = g<int>;
    printf("%d %d %d %d\\n", f(1), q(2), g<int>(3), h<int>(4));
    return 0;
}
`,
        expectedStdout: "9 2 3 8\n",
      },
      {
        name: "f32-interpolation",
        validateLlvm: true,
        source: `import [String] from "std/string.bpl";
extern printf(fmt: string, ...);
frame main() ret int {
    local f: f32 = cast<f32>(1.5);
    local d: double = 2.25;
    local s: String = \`\${f} \${d}\`;
    printf("%s\\n", s.cstr());
    return 0;
}
`,
        expectedStdout: "1.500000 2.250000\n",
      },
      {
        name: "auto-destroy-unwinding",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct R {
    id: int,
    @[auto_destroy]
    frame destroy(this: *R) ret void { printf("D%d\\n", this.id); }
}
frame boom() ret void { throw 7; }
frame middle() ret void {
    local r: R = R { id: 1 };
    defer { printf("defer middle\\n"); }
    boom();
    printf("unreached %d\\n", r.id);
}
frame direct() ret void {
    local r: R = R { id: 2 };
    if (r.id == 2) { throw 8; }
}
frame main() ret int {
    try { middle(); } catch (e: int) { printf("caught %d\\n", e); }
    try { direct(); } catch (e: int) { printf("caught %d\\n", e); }
    try {
        local r: R = R { id: 3 };
        boom();
        printf("%d\\n", r.id);
    } catch (e: int) { printf("caught %d\\n", e); }
    return 0;
}
`,
        expectedStdout:
          "defer middle\nD1\ncaught 7\nD2\ncaught 8\nD3\ncaught 7\n",
      },
      {
        name: "auto-destroy-unwinding-shapes",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct R {
    id: int,
    @[auto_destroy]
    frame destroy(this: *R) ret void { printf("D%d ", this.id); }
}
struct Pair { a: R, b: R, }
struct Box<T> {
    v: T,
    @[auto_destroy]
    frame destroy(this: *Box<T>) ret void { printf("B "); }
}
frame boom(n: int) ret void { if (n > 0) { throw n; } }
frame make(id: int) ret R { local r: R = R { id: id }; boom(0); return r; }
frame loops() ret void {
    loop (local i: int = 0; i < 4; i++) {
        local _r: R = R { id: 10 + i };
        if (i == 1) { continue; }
        boom(i - 2);
    }
}
frame arrays() ret void {
    local arr: R[2] = [R { id: 20 }, R { id: 21 }];
    local p: Pair = Pair { a: R { id: 30 }, b: R { id: 31 } };
    local b: Box<int> = Box<int> { v: 1 };
    boom(arr[0].id + p.a.id + b.v);
}
frame moved() ret void {
    local r: R = R { id: 40 };
    throw r;
}
frame main() ret int {
    try { loops(); } catch (e: int) { printf("| caught %d\\n", e); }
    try { arrays(); } catch (e: int) { printf("| caught %d\\n", e); }
    try { moved(); } catch (e: R) { printf("| caught R%d\\n", e.id); }
    local m: R = make(50);
    printf("| made %d\\n", m.id);
    loop (local k: int = 0; k < 3; k++) { local t: R = R { id: 60 + k }; if (t.id == 61) { break; } }
    printf("| done\\n");
    return 0;
}
`,
        expectedStdout:
          "D10 D11 D12 D13 | caught 1\nB D31 D30 D21 D20 | caught 51\n| caught R40\nD40 | made 50\nD60 D61 | done\nD50 ",
      },
    ]);
  }, 300000);
});

describe("open audit bugs: rejected programs", () => {
  // spec: R-FN-8, R-DECL-1, R-LEX-3, R-CTRL-7, R-CTRL-8, R-ASM-1
  test("reports each misuse with a diagnostic code", () => {
    expectCheckDiagnostics([
      {
        name: "generic-function-value-without-arguments",
        source: `frame h<U>(x: int) ret int { return x + cast<int>(sizeof<U>()); }
frame main() ret int { local f: Func<int>(int) = h; return f(1); }
`,
        code: "BPL_GENERIC_ARITY_MISMATCH",
      },
      {
        name: "growing-generic-recursion",
        source: `struct W<T> { v: T, }
frame grow<T>(x: T, n: int) ret int {
    if (n == 0) { return 0; }
    local w: W<T> = W<T> { v: x };
    return grow<W<T>>(w, n - 1);
}
frame main() ret int { return grow<int>(1, 3); }
`,
        code: "BPL_TYPE_RECURSION_CYCLE",
      },
      {
        name: "untyped-global",
        source: `global B;
frame main() ret int { return 0; }
`,
        code: "BPL_VARIABLE_TYPE_ANNOTATION_MISSING",
      },
      {
        name: "untyped-local",
        source: `frame main() ret int { local x; return 0; }
`,
        code: "BPL_VARIABLE_TYPE_ANNOTATION_MISSING",
      },
      {
        name: "reserved-function-name",
        source: `frame ret(a: int) ret int { return a; }
frame main() ret int { return 0; }
`,
        message: "'ret' is a reserved word",
      },
      {
        name: "increment-bool",
        source: `frame main() ret int { local b: bool = true; b++; return cast<int>(b); }
`,
        code: "BPL_INCREMENT_OPERAND_TYPE_MISMATCH",
      },
      {
        name: "unused-variable",
        source: `frame main() ret int { local x: int = 1; return 0; }
`,
        code: "BPL_UNUSED_VARIABLE",
      },
      {
        name: "duplicate-case",
        source: `frame main() ret int {
    switch (1) { case 1: break; case 1: break; default: break; }
    return 0;
}
`,
        code: "BPL_SWITCH_CASE_DUPLICATE",
      },
      {
        name: "case-without-terminator",
        source: `frame main() ret int {
    local x: int = 0;
    switch (1) { case 1: x = 2; default: break; }
    return x;
}
`,
        code: "BPL_SWITCH_CASE_TERMINATOR_MISSING",
      },
      {
        name: "unknown-asm-flavor",
        source: `frame main() ret int { asm("arm") { nop } return 0; }
`,
        code: "BPL_ASM_FLAVOR_UNKNOWN",
      },
      {
        name: "undefined-asm-operand",
        source: `frame main() ret int { asm("intel") { mov eax, (missing) } return 0; }
`,
        code: "BPL_SYMBOL_NOT_FOUND",
      },
    ]);
  }, 120000);
});
