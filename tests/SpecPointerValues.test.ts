import { describe, test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// A `*Spec` is a `{ data, vtable }` value, so it can leave the frame that
// converted it: returns, fields, globals, tuples, generic arguments.

describe("spec pointers as values", () => {
  // spec: R-SPEC-4
  test("runs identically at O0 and O3", () => {
    expectCorrectnessSuite([
      {
        name: "spec-pointers-as-values",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
spec Named { frame name(this: *Self) ret string; }
spec Shape : Named { frame area(this: *Self) ret int; }
struct Ci : Shape { r: int, frame name(this: *Ci) ret string { return "circle"; } frame area(this: *Ci) ret int { return this.r * 3; } }
struct Sq : Shape { s: int, frame name(this: *Sq) ret string { return "square"; } frame area(this: *Sq) ret int { return this.s * this.s; } }
struct Holder { shape: *Shape, count: int, }
struct Box<T> { v: T, }
global gc: Ci;
global gshape: *Shape = nullptr;
frame pick(c: *Ci, s: *Sq, big: bool) ret *Shape {
    if (big) { return s; }
    return c;
}
frame pair(c: *Ci) ret (*Shape, int) { return (c, 7); }
frame boxed(s: *Sq) ret Box<*Shape> { return Box<*Shape> { v: s }; }
frame clobber(a: int) ret int {
    local arr: int[64];
    loop (local i: int = 0; i < 64; i++) { arr[i] = a + i; }
    return arr[5];
}
frame describe(n: *Named) ret string { return n.name(); }
frame main() ret int {
    local c: Ci = Ci { r: 2 };
    local s: Sq = Sq { s: 4 };
    local a: *Shape = pick(&c, &s, true);
    local b: *Shape = pick(&c, &s, false);
    printf("%d %d %d\\n", clobber(1), a.area(), b.area());
    local h: Holder = Holder { shape: &c, count: 1 };
    h.shape = &s;
    printf("%s %d\\n", h.shape.name(), h.shape.area());
    local (t: *Shape, n: int) = pair(&c);
    local bx: Box<*Shape> = boxed(&s);
    printf("%d %d %d\\n", t.area(), n, bx.v.area());
    printf("%d\\n", cast<int>(gshape == nullptr));
    gc.r = 5;
    gshape = &gc;
    printf("%d %d %s\\n", cast<int>(gshape != nullptr), gshape.area(), describe(gshape));
    local nothing: *Shape = nullptr;
    printf("%d %d\\n", cast<int>(nothing == nullptr), cast<int>(a == b));
    local raw: *void = cast<*void>(a);
    printf("%d\\n", cast<int>(raw == cast<*void>(&s)));
    local f: Lambda<int>() = || ret int { return a.area() + b.area(); };
    printf("%d %d\\n", clobber(2), f());
    local pp: **Shape = &a;
    printf("%d\\n", pp.area());
    local arr: *Shape[2] = [&c, &s];
    local sum: int = 0;
    loop (local i: int = 0; i < 2; i++) { sum = sum + arr[i].area(); }
    printf("%d %d\\n", sum, sizeof(*Shape));
    return 0;
}
`,
        expectedStdout:
          "6 16 6\nsquare 16\n6 7 16\n1\n1 15 circle\n1 0\n1\n7 22\n16\n22 16\n",
      },
      {
        name: "spec-pointer-exact-type-checks",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
spec Shape { frame area(this: *Self) ret int; }
struct Ci : Shape { r: int, frame area(this: *Ci) ret int { return this.r * 3; } }
struct Sq : Shape { s: int, frame area(this: *Sq) ret int { return this.s * this.s; } }
frame main() ret int {
    local c: Ci = Ci { r: 2 };
    local sp: *Shape = &c;
    printf("%d %d\\n", cast<int>(sp is Ci), cast<int>(sp is Sq));
    return second();
}
frame second() ret int {
    local s: Sq = Sq { s: 3 };
    local sp: *Shape = &s;
    local q: *Sq = sp as *Sq;
    local none: *Shape = nullptr;
    printf("%d %d %d %d\\n", cast<int>(sp is Sq), q.s, cast<int>((sp as *Ci) == nullptr), cast<int>(none is Sq));
    return 0;
}
`,
        expectedStdout: "1 0\n1 3 1 0\n",
      },
    ]);
  }, 240000);

  // spec: R-SPEC-4
  test("rejects conversions it cannot represent", () => {
    expectCheckDiagnostics([
      {
        name: "second-parent-spec",
        source: `spec A { frame a(this: *Self) ret int; }
spec B { frame b(this: *Self) ret int; }
spec C : A, B { frame c(this: *Self) ret int; }
struct S : C { frame a(this: *S) ret int { return 1; } frame b(this: *S) ret int { return 2; } frame c(this: *S) ret int { return 3; } }
frame useB(x: *B) ret int { return x.b(); }
frame main() ret int { local s: S = S {}; local c: *C = &s; return useB(c); }
`,
        code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      },
      {
        name: "spec-pointer-extern-parameter",
        source: `spec Shape { frame area(this: *Self) ret int; }
extern takes(s: *Shape);
frame main() ret int { return 0; }
`,
        code: "BPL_EXTERN_ABI_UNSUPPORTED",
      },
      {
        name: "spec-pointer-variadic-argument",
        source: `extern printf(fmt: string, ...);
spec Shape { frame area(this: *Self) ret int; }
struct Ci : Shape { r: int, frame area(this: *Ci) ret int { return this.r; } }
frame main() ret int { local c: Ci = Ci { r: 2 }; local sp: *Shape = &c; printf("%p", sp); return 0; }
`,
        code: "BPL_EXTERN_ABI_UNSUPPORTED",
      },
    ]);
  }, 120000);
});
