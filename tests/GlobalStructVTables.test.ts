import { describe, test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

describe("hidden vtable pointers of zero-initialized values", () => {
  // spec: R-DECL-2, R-STRUCT-5
  test("zeroed globals can call methods, at any nesting", () => {
    expectCorrectnessSuite([
      {
        name: "global-struct-vtables",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
spec V { frame val(this: *Self) ret int; }
struct S: V {
    x: int,
    frame val(this: *S) ret int { return this.x + 1; }
    frame m(this: *S) ret int { return this.x + 2; }
}
struct B<T> { v: T, frame get(this: *B<T>) ret T { return this.v; } }
struct O {
    n: int,
    s: S,
    a: S[2],
    b: B<S>,
    frame k(this: *O) ret int { return this.n + 5; }
}
struct OnlyArray { a: S[2], }
frame total<T: V>(p: *T) ret int { return p.val(); }
global gs: S;
global gb: B<long>;
global go: O;
global gg: O[2][2];
global ga: OnlyArray;
frame main() ret int {
    local viaSpec: *V = &gs;
    printf("%d %d %d\\n", gs.m(), total<S>(&gs), viaSpec.val());
    printf("%ld %d %d\\n", gb.get(), go.k(), go.s.m());
    printf("%d %d\\n", go.a[1].m(), go.b.get().m());
    printf("%d %d\\n", gg[1][1].a[0].m(), gg[0][1].k());
    printf("%d\\n", ga.a[1].m());
    gs.x = 40;
    printf("%d\\n", gs.m());
    return 0;
}
`,
        expectedStdout: "2 1 1\n0 5 2\n2 2\n2 5\n2\n42\n",
      },
    ]);
  });

  // spec: R-STRUCT-5
  test("an uninitialized local with an array of structs has vtables", () => {
    expectCorrectnessSuite([
      {
        name: "local-array-field-vtables",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct S { x: int, frame m(this: *S, d: int) ret int { this.x = d; return this.x + 1; } }
struct OnlyArray { a: S[2], }
frame main() ret int {
    local o: OnlyArray;
    printf("%d\\n", o.a[1].m(4));
    return 0;
}
`,
        expectedStdout: "5\n",
      },
    ]);
  });
});
