import { describe, test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// Found by the language conformance audit of 2026-11-10 (BUG-532 to BUG-547).

const SPEC = `extern printf(fmt: string, ...);
spec Sp { frame s(this: *Self) ret int; }
struct C : Sp { c: int, frame s(this: *C) ret int { return this.c; } }
frame clobber(a: int) ret int {
    local arr: int[64];
    loop (local i: int = 0; i < 64; i++) { arr[i] = a + i; }
    return arr[5];
}
`;

describe("conformance audit: programs", () => {
  // spec: R-SPEC-4, R-STRUCT-3, R-STRUCT-5, R-FN-9, R-EXPR-10
  test("runs the fixed programs identically at O0 and O3", () => {
    expectCorrectnessSuite([
      {
        // R-SPEC-4
        name: "lambda-keeps-its-spec-pointer",
        validateLlvm: true,
        source: `${SPEC}
frame mk(c: *C) ret Lambda<int>() {
    local sp: *Sp = c;
    return || ret int { return sp.s(); };
}
frame main() ret int {
    local c: C = C { c: 7 };
    local l: Lambda<int>() = mk(&c);
    printf("%d %d\\n", clobber(1), l());
    return 0;
}
`,
        expectedStdout: "6 7\n",
      },
      {
        // R-STRUCT-5, R-FN-9
        name: "generic-locals-get-vtables-and-constructors",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
spec G { frame get(this: *Self) ret int; }
struct K : G { v: int, frame new(this: *K) { this.v = 7; } frame get(this: *K) ret int { return this.v; } }
struct Box<U> : G { v: U, frame new(this: *Box<U>) { this.v = cast<U>(9); } frame get(this: *Box<U>) ret int { return cast<int>(this.v); } }
struct A { n: int, frame speak(this: *A) ret int { return 1; } }
struct B : A { }
struct Animal { n: int, frame speak(this: *Animal) ret string { return "animal"; } }
struct Dog : Animal { frame speak(this: *Dog) ret string { return "dog"; } }
frame f<T: G>() ret int { local x: T; return x.get(); }
frame g<T: G>() ret int { local a: T[2]; return a[1].get(); }
frame callp(a: *void) ret string { local an: *Animal = a; return an.speak(); }
frame h<T>() ret string { local arr: T[2]; return callp(cast<*void>(&arr[1])); }
frame main() ret int {
    local bs: B[2];
    local p: *A = cast<*A>(&bs[1]);
    printf("%d %d %d %d %d %s\\n", f<K>(), g<K>(), f<Box<long>>(), g<Box<int>>(), p.speak(), h<Dog>());
    return 0;
}
`,
        expectedStdout: "7 7 9 9 1 dog\n",
      },
      {
        name: "zeroed-owning-local-keeps-zero-fields",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct R {
    id: int,
    @[auto_destroy]
    frame destroy(this: *R) ret void { printf("D%d\\n", this.id); }
}
frame main() ret int {
    local u: R;
    printf("u%d\\n", u.id);
    return 0;
}
`,
        expectedStdout: "u0\nD0\n",
      },
      {
        // R-SPEC-4
        name: "inherited-spec-methods",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
spec Named { frame name(this: *Self) ret string; }
spec Fancy : Named { frame fancy(this: *Self) ret int; }
spec Eq { frame eq(this: *Self, o: *Self) ret bool; }
struct F : Fancy, Eq {
    k: int,
    frame name(this: *F) ret string { return "f"; }
    frame fancy(this: *F) ret int { return 9; }
    frame eq(this: *F, o: *F) ret bool { return this.k == o.k; }
}
frame useF<T: Fancy>(x: *T) ret string { return x.name(); }
frame same<T: Eq>(a: *T, b: *T) ret bool { return a.eq(b); }
frame main() ret int {
    local f: F = F { k: 1 };
    local fp: *Fancy = &f;
    printf("%s %d %s %d\\n", fp.name(), fp.fancy(), useF<F>(&f), cast<int>(same<F>(&f, &f)));
    return 0;
}
`,
        expectedStdout: "f 9 f 1\n",
      },
      {
        name: "is-on-null-pointer",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct Animal { name: string, }
struct Dog : Animal { breed: string, }
frame main() ret int {
    local a: *Animal = nullptr;
    local d: Dog = Dog { name: "rex", breed: "lab" };
    local b: *Animal = cast<*Animal>(&d);
    printf("%d %d\\n", cast<int>(a is Dog), cast<int>(b is Dog));
    return 0;
}
`,
        expectedStdout: "0 1\n",
      },
      {
        // R-EXPR-10
        name: "sizeof-of-pointer-and-array-types",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct P { x: int, y: long, }
frame main() ret int {
    local arr: int[5];
    local q: *int = &arr[0];
    printf("%lu %lu %lu %lu %lu %lu\\n", sizeof(int[5]), sizeof(*int), sizeof(P[3]), sizeof(**P), sizeof(arr[1]), sizeof(*q));
    return 0;
}
`,
        expectedStdout: "20 8 48 8 4 4\n",
      },
      {
        // R-STRUCT-3
        name: "struct-literal-source-order",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct P { a: int, b: int, }
frame t(tag: int) ret int { printf("%d ", tag); return tag; }
frame main() ret int {
    local p: P = P { b: t(1), a: t(2) };
    printf("| %d %d\\n", p.a, p.b);
    return 0;
}
`,
        expectedStdout: "1 2 | 2 1\n",
      },
    ]);
  }, 240000);
});

describe("conformance audit: rejected programs", () => {
  // spec: R-SPEC-4, R-CONV-4, R-DECL-7, R-FN-9, R-STRUCT-4
  test("reports each misuse instead of crashing or miscompiling", () => {
    expectCheckDiagnostics([
      {
        // R-SPEC-4
        name: "spec-pointer-in-returned-tuple",
        source: `${SPEC}frame mk(c: *C) ret (*Sp, int) { return (c, 1); }
frame main() ret int { local c: C = C { c: 7 }; local t: (*Sp, int) = mk(&c); return t.1 + clobber(0); }
`,
        code: "BPL_SPEC_POINTER_ESCAPES",
      },
      {
        name: "spec-pointer-as-returned-generic-argument",
        source: `${SPEC}struct H<T> { p: T, }
frame mk(c: *C) ret H<*Sp> { return H<*Sp> { p: c }; }
frame main() ret int { local c: C = C { c: 7 }; local h: H<*Sp> = mk(&c); return h.p.s() + clobber(0); }
`,
        code: "BPL_SPEC_POINTER_ESCAPES",
      },
      {
        name: "lambda-captures-owning-value",
        source: `struct R {
    v: int,
    @[auto_destroy]
    frame destroy(this: *R) ret void { this.v = 0; }
}
frame mk() ret Lambda<int>() {
    local r: R = R { v: 42 };
    return || ret int { return r.v; };
}
frame main() ret int { local l: Lambda<int>() = mk(); return l(); }
`,
        code: "BPL_OWNING_VALUE_COPIED",
      },
      {
        name: "missing-method-of-parent-spec",
        source: `spec Named { frame name(this: *Self) ret string; }
spec Fancy : Named { frame fancy(this: *Self) ret int; }
struct F : Fancy { frame fancy(this: *F) ret int { return 9; } }
frame main() ret int { local f: F = F {}; return f.fancy(); }
`,
        message: "does not implement method 'name' from spec 'Named'",
      },
      {
        name: "self-method-through-spec-pointer",
        source: `spec Eq { frame eq(this: *Self, o: *Self) ret bool; }
struct V : Eq { x: int, frame eq(this: *V, o: *V) ret bool { return this.x == o.x; } }
frame main() ret int { local v: V = V { x: 1 }; local cp: *Eq = &v; return cast<int>(cp.eq(&v)); }
`,
        code: "BPL_INSTANCE_METHOD_NOT_COMPATIBLE",
      },
      {
        // R-CONV-4
        name: "array-plus-integer",
        source: `frame main() ret int { local arr: int[5] = [1, 2, 3, 4, 5]; local end: *int = arr + 5; return *(end - 1); }
`,
        code: "BPL_BINARY_OPERAND_TYPE_MISMATCH",
      },
      {
        // R-DECL-7
        name: "constant-array-to-pointer",
        source: `frame main() ret int { local const arr: int[2] = [1, 2]; local p: *int = arr; *p = 7; return arr[0]; }
`,
        code: "BPL_ADDRESS_OF_CONSTANT",
      },
      {
        name: "constant-global-array-to-slice",
        source: `global const GA: int[2] = [1, 2];
frame main() ret int { local s: int[] = GA; s[0] = 9; return GA[0]; }
`,
        code: "BPL_ADDRESS_OF_CONSTANT",
      },
      {
        // R-FN-9
        name: "unknown-constraint",
        source: `frame nm<T: DoesNotExist>(_x: *T) ret int { return 0; }
frame main() ret int { return 0; }
`,
        code: "BPL_TYPE_NOT_FOUND",
      },
      {
        // R-STRUCT-4
        name: "child-field-reuses-inherited-field",
        source: `struct P { x: int, }
struct C : P { x: long, }
frame main() ret int { local c: C = C { x: 5 }; return cast<int>(c.x); }
`,
        code: "BPL_SYMBOL_ALREADY_DEFINED",
      },
      {
        name: "child-method-reuses-inherited-field",
        source: `struct A { a: int, }
struct D : A { frame a(this: *D) ret int { return 42; } }
frame main() ret int { local d: D = D { a: 3 }; return d.a; }
`,
        code: "BPL_SYMBOL_ALREADY_DEFINED",
      },
      {
        name: "mutually-recursive-aliases",
        source: `type T1 = T2;
type T2 = T1;
frame main() ret int { return 0; }
`,
        code: "BPL_TYPE_RECURSION_CYCLE",
      },
      {
        name: "specs-extending-each-other",
        source: `spec A : B { frame a(this: *Self) ret int; }
spec B : A { frame b(this: *Self) ret int; }
frame main() ret int { return 0; }
`,
        code: "BPL_TYPE_RECURSION_CYCLE",
      },
    ]);
  }, 120000);
});
