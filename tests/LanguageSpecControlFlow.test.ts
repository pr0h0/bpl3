import { describe, expect, test } from "bun:test";

import {
  expectCorrectnessSuite,
  runBplAtOptimization,
} from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// Executable checks for LANGUAGE_SPEC.md section 8.

describe("language specification: conditionals, loops, and switch", () => {
  // spec: R-CTRL-1, R-CTRL-3, R-CTRL-4, R-CTRL-7, R-CTRL-8
  test("branches, loop forms, break/continue, and switch dispatch", () => {
    expectCorrectnessSuite([
      {
        name: "control-flow",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
enum Color { Red, Green }
frame sign(x: int) ret string {
  if (x > 0) return "pos";
  if (x < 0) { return "neg"; } else if (x == 0) { return "zero"; } else { return "unreachable"; }
}
frame name(v: int) ret string {
  local r: string = "";
  switch (v) {
    case 1: { r = "one"; break; }
    case 3: { r = "three"; break; }
    default: { r = "many"; break; }
  }
  return r;
}
frame fall(v: int) ret int {
  local r: int = 0;
  switch (v) {
    case 1: { r += 1; fallthrough; }
    case 2: { r += 10; break; }
    default: { r += 100; break; }
  }
  return r;
}
frame text(s: string) ret int {
  switch (s) {
    case "a": { return 1; }
    default: { return 0; }
  }
}
frame color(c: Color) ret int {
  switch (c) {
    case Color.Red: { return 1; }
    case Color.Green: { return 2; }
  }
  return 0;
}
frame main() ret int {
  printf("%s %s %s\\n", sign(3), sign(-3), sign(0));
  local n: int = 0;
  loop { n += 1; if (n == 3) { break; } }
  local i: int = 0;
  loop (i < 5) { i = i + 1; if (i == 2) { continue; } printf("w%d ", i); }
  loop (local j: int = 0; j < 3; j = j + 1) { printf("c%d ", j); }
  local k: int = 0;
  loop (; k < 2; ) { k += 1; }
  local m: int = 0;
  loop (;;) { m += 1; if (m > 4) { break; } }
  printf("%d %d %d %d\\n", n, i, k, m);
  local s: int = 0;
  loop (s < 4) {
    s += 1;
    switch (s) {
      case 2: { break; }
      case 3: { continue; }
      default: { break; }
    }
    printf("s%d ", s);
  }
  local unmatched: int = 5;
  switch (unmatched) { case 1: { printf("one"); break; } }
  printf("\\n%s %s %s %d %d %d %d %d %d\\n", name(1), name(3), name(2), fall(1), fall(2), fall(3), text("a"), text("b"), color(Color.Green));
  return 0;
}`,
        expectedStdout:
          "pos neg zero\nw1 w3 w4 w5 c0 c1 c2 3 5 2 5\ns1 s2 s4 \none three many 11 10 100 1 0 2\n",
      },
    ]);
  }, 120000);

  // spec: R-CTRL-1, R-CTRL-2, R-CTRL-4, R-CTRL-5, R-CTRL-6, R-CTRL-7, R-CTRL-8
  test("rejects invalid conditions, jumps, loop keywords, and switches", () => {
    expectCheckDiagnostics([
      {
        name: "if-without-parentheses",
        source:
          "frame main() ret int { local x: int = 1; if x > 0 { return 1; } return 0; }\n",
        message: "Unexpected syntax",
      },
      {
        name: "integer-if-condition",
        source:
          "frame main() ret int { local i: int = 2; if (i) { return 1; } return 0; }\n",
        code: "BPL_CONDITION_TYPE_MISMATCH",
      },
      {
        name: "integer-loop-condition",
        source:
          "frame main() ret int { local i: int = 3; loop (i) { i -= 1; } return i; }\n",
        code: "BPL_CONDITION_TYPE_MISMATCH",
      },
      {
        name: "break-outside",
        source: "frame main() ret int { break; return 0; }\n",
        code: "BPL_BREAK_OUTSIDE_CONTEXT",
      },
      {
        name: "continue-outside",
        source: "frame main() ret int { continue; return 0; }\n",
        code: "BPL_CONTINUE_OUTSIDE_LOOP",
      },
      {
        name: "break-in-defer",
        source:
          "frame main() ret int { local i: int = 0; loop { i += 1; defer { break; } } return i; }\n",
        code: "BPL_BREAK_OUTSIDE_CONTEXT",
      },
      {
        name: "continue-in-defer",
        source:
          "frame main() ret int { local i: int = 0; loop (i < 3) { i += 1; defer { continue; } } return i; }\n",
        code: "BPL_CONTINUE_OUTSIDE_LOOP",
      },
      {
        name: "break-in-lambda",
        source:
          "frame main() ret int { local i: int = 0; loop (i < 3) { i += 1; local f: Lambda<void>() = || { break; }; f(); } return i; }\n",
        code: "BPL_BREAK_OUTSIDE_CONTEXT",
      },
      {
        name: "fallthrough-in-lambda",
        source:
          "frame main() ret int { local v: int = 1; switch (v) { case 1: { local f: Lambda<void>() = || { fallthrough; }; f(); break; } default: { break; } } return v; }\n",
        code: "BPL_FALLTHROUGH_OUTSIDE_SWITCH",
      },
      {
        name: "while-keyword",
        source:
          "frame main() ret int { local a: int = 1; while (a < 3) { a += 1; } return a; }\n",
        message: "Unexpected syntax",
      },
      {
        name: "for-keyword",
        source:
          "frame main() ret int { local a: int = 1; for (a = 0; a < 3; a += 1) { } return a; }\n",
        message: "Unexpected syntax",
      },
      {
        name: "do-while",
        source:
          "frame main() ret int { local a: int = 1; do { a += 1; } while (a < 3); return a; }\n",
        message: "Unexpected syntax",
      },
      {
        name: "switch-on-double",
        source:
          "frame main() ret int { local v: double = 1.0; switch (v) { case 1: { break; } default: { break; } } return 0; }\n",
        code: "BPL_SWITCH_VALUE_TYPE_MISMATCH",
      },
      {
        name: "duplicate-case",
        source:
          "frame main() ret int { local v: int = 1; switch (v) { case 1: { break; } case 1: { break; } default: { break; } } return v; }\n",
        message: "Duplicate case value '1'",
      },
      {
        name: "case-without-terminator",
        source:
          "frame main() ret int { local v: int = 1; switch (v) { case 1: { v = 2; } default: { break; } } return v; }\n",
        message: "Switch case must end with a terminator",
      },
    ]);
  }, 120000);
});

describe("language specification: defer", () => {
  // spec: R-DEFER-1, R-DEFER-2, R-DEFER-3, R-DEFER-4, R-DEFER-5
  test("deferred code runs in LIFO order on every block exit", () => {
    expectCorrectnessSuite([
      {
        name: "defer-semantics",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
frame early(flag: bool) ret int {
  defer { printf("d1 "); }
  defer printf("d2 ");
  if (flag) { return 1; }
  printf("body ");
  return 0;
}
frame loopy() {
  local i: int = 0;
  loop (i < 3) {
    i += 1;
    defer { printf("L%d ", i); }
    if (i == 1) { continue; }
    if (i == 3) { break; }
    printf("b%d ", i);
  }
}
frame nested() {
  defer { printf("outer "); }
  if (true) {
    defer { printf("inner "); }
    printf("block ");
  }
  printf("after ");
}
frame thrower() {
  defer { printf("cleanup "); }
  throw 5;
}
frame returnValue() ret int {
  local x: int = 1;
  local p: *int = &x;
  # The deferred write happens, but after the return value is evaluated.
  defer { *p = 100; }
  return x;
}
frame deferredThrow() {
  defer { throw 7; }
  printf("before ");
}
frame main() ret int {
  early(true); printf("| ");
  early(false); printf("| ");
  loopy(); printf("| ");
  nested(); printf("| ");
  try { thrower(); } catch (e: int) { printf("caught%d ", e); }
  printf("| %d | ", returnValue());
  try { deferredThrow(); } catch (e: int) { printf("deferred%d", e); }
  printf("\\n");
  return 0;
}`,
        expectedStdout:
          "d2 d1 | body d2 d1 | L1 b2 L2 L3 | block inner after outer | cleanup caught5 | 1 | before deferred7\n",
      },
    ]);
  }, 120000);

  // spec: R-DEFER-4
  test("rejects returning a value from deferred code", () => {
    expectCheckDiagnostics([
      {
        name: "defer-return-value",
        source:
          "frame f() ret int { defer { return 1; } return 0; }\nframe main() ret int { return f(); }\n",
        code: "BPL_DEFER_RETURN_VALUE_INVALID",
      },
    ]);
  }, 120000);

  // spec: R-DEFER-5, R-ARR-3
  test("allows a deferred write through a borrowed slice", () => {
    expectCorrectnessSuite([
      {
        name: "defer-slice-write",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;
# A captured slice keeps the backing pointer, so the write reaches the
# caller's array rather than a copy of it.
frame update(xs: int[]) {
  defer { xs[0] = 42; }
}
frame main() ret int {
  local xs: int[1] = [0];
  update(xs);
  printf("%d\\n", xs[0]);
  return 0;
}`,
        expectedStdout: "42\n",
      },
    ]);
  }, 120000);

  // spec: R-DEFER-5
  test("rejects assigning to an outer variable from deferred code", () => {
    expectCheckDiagnostics([
      {
        name: "defer-assign-outer-scalar",
        source: `frame main() ret int {
  local x: int = 1;
  defer { x = 100; }
  return x;
}`,
        code: "BPL_CAPTURED_VALUE_ASSIGNED",
      },
      {
        name: "defer-assign-outer-element",
        source: `frame main() ret int {
  local values: int[2];
  defer { values[0] = 1; }
  return values[0];
}`,
        code: "BPL_CAPTURED_VALUE_ASSIGNED",
      },
      {
        name: "defer-update-outer-scalar",
        source: `frame main() ret int {
  local x: int = 1;
  defer { x++; }
  return x;
}`,
        code: "BPL_CAPTURED_VALUE_ASSIGNED",
      },
    ]);
  }, 120000);
});

describe("language specification: exceptions", () => {
  // spec: R-EXC-1, R-EXC-2, R-EXC-3
  test("typed catches match exact types and unmatched values propagate", () => {
    expectCorrectnessSuite([
      {
        name: "exception-semantics",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct MyErr { code: int, }
struct Base { v: int, }
struct Derived : Base { w: int, }
frame thrower(kind: int) {
  if (kind == 1) { throw 42; }
  if (kind == 2) { throw true; }
  if (kind == 3) { throw MyErr { code: 7 }; }
  if (kind == 4) { throw 2.5; }
  if (kind == 5) { throw Derived { v: 1, w: 2 }; }
  if (kind == 6) { throw "text"; }
  printf("none ");
}
frame run(kind: int) {
  try {
    thrower(kind);
    printf("after ");
  } catch (e: int) {
    printf("int%d ", e);
  } catch (e: bool) {
    printf("bool%d ", e);
  } catch (e: MyErr) {
    printf("err%d ", e.code);
  } catch (e: Base) {
    printf("base%d ", e.v);
  } catch {
    printf("any ");
  }
}
frame inner() {
  try { throw 9; } catch (e: int) { printf("inner "); throw e + 1; }
}
frame typedOnly() {
  try { throw 3; } catch (e: bool) { printf("wrong%d ", e); }
}
frame main() ret int {
  run(0); run(1); run(2); run(3); run(4); run(5); run(6);
  local wide: long = 5;
  try { throw wide; } catch (e: int) { printf("int%d ", e); } catch (e: long) { printf("long%ld ", e); }
  try { throw Derived { v: 1, w: 2 }; } catch (e: Base) { printf("base%d ", e.v); } catch (e: Derived) { printf("derived%d ", e.w); }
  try { inner(); } catch (e: int) { printf("outer%d ", e); }
  try { typedOnly(); } catch (e: int) { printf("propagated%d", e); }
  printf("\\n");
  return 0;
}`,
        expectedStdout:
          "none after int42 bool1 err7 any any any long5 derived2 inner outer10 propagated3\n",
      },
    ]);
    for (const level of [0, 3] as const) {
      const result = runBplAtOptimization(
        "frame main() ret int { throw 3; }",
        level,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Uncaught exception");
    }
  }, 120000);

  // spec: R-EXC-2
  test("rejects try without catch", () => {
    expectCheckDiagnostics([
      {
        name: "try-without-catch",
        source: "frame main() ret int { try { throw 1; } return 0; }\n",
        message: "Unexpected syntax",
      },
    ]);
  }, 120000);
});
