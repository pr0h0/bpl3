import { describe, test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// Programs the fuzzer's type mutations showed reaching code generation.
describe("misused types are rejected by the checker", () => {
  // spec: R-STRUCT-2
  test("a method receiver must be its own struct", () => {
    expectCheckDiagnostics(
      [
        ["array", "this: int[2]"],
        ["unrelated", "this: *T"],
        ["primitive", "this: int"],
        ["double-pointer", "this: **S"],
      ].map(([name, receiver]) => ({
        name: `receiver-${name}`,
        source: `struct T { y: int, } struct S { x: int, frame m(${receiver}) ret int { return 1; } } frame main() {}`,
        code: "BPL_METHOD_RECEIVER_TYPE_MISMATCH",
      })),
    );
  });

  // spec: R-STRUCT-3
  test("a struct literal sets each field once", () => {
    expectCheckDiagnostics([
      {
        name: "duplicate-field",
        source:
          "struct S { x: int, } frame main() { local s: S = S { x: 1, x: 2 }; s; }",
        code: "BPL_STRUCT_LITERAL_FIELD_DUPLICATE",
      },
    ]);
  });

  // spec: R-STRUCT-3
  test("an inherited field converts like a declared one", () => {
    expectCorrectnessSuite([
      {
        name: "inherited-field-conversion",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct P { x: long, frame m(this: *P) ret long { return this.x; } }
struct C: P { y: u8, }
struct D: C { z: int, }
frame main() ret int {
    local c: C = C { x: 1, y: 200 };
    local small: int = -5;
    local d: D = D { x: small, y: 2, z: 3 };
    printf("%ld %d %ld %d\\n", c.x, cast<int>(c.y), d.m(), d.z);
    return 0;
}
`,
        expectedStdout: "1 200 -5 3\n",
      },
    ]);
  });

  // spec: R-EXPR-3
  test("assignment needs real storage", () => {
    const prelude =
      "struct S { x: int, } frame make() ret S { return S { x: 1 }; } frame ptr(s: *S) ret *S { return s; }";
    expectCheckDiagnostics([
      {
        name: "field-of-call",
        source: `${prelude} frame main() { make().x = 2; }`,
        code: "BPL_ASSIGNMENT_TARGET_INVALID",
      },
      {
        name: "tuple-field-of-call",
        source: `${prelude} frame main() { local v: int = 0; (v, make().x) = (1, 2); v; }`,
        code: "BPL_ASSIGNMENT_TARGET_INVALID",
      },
      {
        name: "increment-through-overload",
        source:
          "struct Q { b: int, frame __get__(this: *Q, i: int) ret int { return this.b + i; } frame __set__(this: *Q, i: int, v: int) { this.b = v - i; } } frame main() { local q: Q = Q { b: 1 }; q[0]--; }",
        code: "BPL_ASSIGNMENT_TARGET_INVALID",
      },
    ]);
    expectCorrectnessSuite([
      {
        name: "field-through-returned-pointer",
        source: `extern printf(fmt: string, ...);
${prelude}
frame main() ret int {
    local s: S = S { x: 1 };
    ptr(&s).x = 9;
    printf("%d\\n", s.x);
    return 0;
}
`,
        expectedStdout: "9\n",
      },
    ]);
  });

  // spec: R-DECL-5
  test("only a tuple can be destructured", () => {
    expectCheckDiagnostics([
      {
        name: "destructure-function",
        source:
          "frame t() ret (int, int) { return (1, 2); } frame main() { local (a: int, b: int) = t; a; b; }",
        code: "BPL_TUPLE_DESTRUCTURE_TARGET_INVALID",
      },
      {
        name: "destructure-integer",
        source: "frame main() { local (a: int, b: int) = 5; a; b; }",
        code: "BPL_TUPLE_DESTRUCTURE_TARGET_INVALID",
      },
    ]);
  });

  // spec: R-STRUCT-2
  test("this needs a receiver", () => {
    expectCheckDiagnostics([
      {
        name: "this-in-static-method",
        source:
          "struct S { x: int, frame u() ret int { return this.x; } } frame main() { S.u(); }",
        code: "BPL_SYMBOL_NOT_FOUND",
      },
    ]);
  });

  // spec: R-EXPR-1
  test("ordering needs numbers or pointers, and * needs a pointer", () => {
    const pair =
      "struct Q { a: int, } frame main() { local x: Q = Q { a: 1 }; local y: Q = Q { a: 2 };";
    const array = "frame main() { local a: int[2] = [7, 8];";
    expectCheckDiagnostics([
      {
        name: "ordering-structs",
        source: `${pair} local b: bool = x < y; b; }`,
        code: "BPL_COMPARISON_TYPE_MISMATCH",
      },
      {
        name: "ordering-arrays",
        source: `${array} local b: bool = a >= a; b; }`,
        code: "BPL_COMPARISON_TYPE_MISMATCH",
      },
      {
        name: "dereference-array",
        source: `${array} local v: int = *a; v; }`,
        code: "BPL_DEREFERENCE_TARGET_INVALID",
      },
      {
        name: "dereference-slice",
        source: `${array} local s: int[] = a; local v: int = *s; v; }`,
        code: "BPL_DEREFERENCE_TARGET_INVALID",
      },
    ]);
  });

  // spec: R-MATCH-2
  test("an enum pattern needs a plain enum value", () => {
    expectCheckDiagnostics([
      {
        name: "enum-pattern-on-array-field",
        source:
          "enum I { P(int), R } enum O { X { i: I[2], n: int }, Y } frame main() { local o: O = O.Y; local r: int = match (o) { O.X { i: I.P(v), n: nn } => v + nn, O.X { i: _, n: _ } => 1, O.Y => 2 }; r; }",
      },
    ]);
  });

  // spec: R-STRUCT-5
  test("a vtable may name a struct declared later", () => {
    expectCorrectnessSuite([
      {
        name: "vtable-forward-struct",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct S { x: int, frame u(this: *S, d: T) { this.x = d.m(); } }
struct T { y: int, frame m(this: T) ret int { return this.y; } }
frame main() ret int {
    local s: S = S { x: 0 };
    s.u(T { y: 4 });
    printf("%d\\n", s.x);
    return 0;
}
`,
        expectedStdout: "4\n",
      },
    ]);
  });

  // spec: R-CONV-8
  test("an integer constant initializes only a number", () => {
    expectCheckDiagnostics(
      [
        ["pointer", "*int", "5"],
        ["string", "string", "7"],
        ["array", "int[2]", "1"],
      ].map(([name, type, value]) => ({
        name: `integer-constant-${name}`,
        source: `frame main() { local v: ${type} = ${value}; v; }`,
        message: "cannot assign",
      })),
    );
    expectCorrectnessSuite([
      {
        name: "bool-constant-integer-global",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
global off: i8 = !true;
global on: i16 = !false;
frame main() ret int {
    printf("%d %d\\n", cast<int>(off), cast<int>(on));
    return 0;
}
`,
        expectedStdout: "0 1\n",
      },
    ]);
  });

  // spec: R-EXC-1
  test("arrays and tuples cannot be thrown or caught", () => {
    expectCheckDiagnostics([
      {
        name: "catch-slice",
        source: "frame main() { try { throw 1; } catch (e: int[]) { e; } }",
        code: "BPL_EXCEPTION_TYPE_UNSUPPORTED",
      },
      {
        name: "catch-tuple",
        source:
          "frame main() { try { throw 1; } catch (e: (int, bool)) { e; } }",
        code: "BPL_EXCEPTION_TYPE_UNSUPPORTED",
      },
      {
        name: "throw-array",
        source:
          "frame main() { local a: int[2] = [1, 2]; try { throw a; } catch (e: int) { e; } }",
        code: "BPL_EXCEPTION_TYPE_UNSUPPORTED",
      },
    ]);
  });

  // spec: R-STRUCT-1
  test("bpl check reports what a build reports", () => {
    expectCheckDiagnostics([
      {
        name: "primitive-field",
        source: "frame main() ret int { local x: int = 5; return x.value; }",
        code: "BPL_MEMBER_NOT_FOUND",
      },
      {
        name: "main-return-type",
        source: 'frame main() ret string { return "x"; }',
        message: "Invalid return type for 'main'",
      },
    ]);
  });

  // spec: R-EXPR-1
  test("arithmetic needs numbers, not arrays", () => {
    const array = "local a: int[2] = [1, 2];";
    expectCheckDiagnostics(
      ["a + a", "a & 1", "a << 1", "1 | a"].map((operation, index) => ({
        name: `array-arithmetic-${index}`,
        source: `frame main() { ${array} local b: int[2] = ${operation}; b; }`,
      })),
    );
  });

  // spec: R-EXPR-1
  test("a type name is not a value, and ~ needs an integer", () => {
    expectCheckDiagnostics([
      {
        name: "type-name-initializer",
        source: "frame main() { local x: long = long; x; }",
        message: "cannot assign type of long",
      },
      {
        name: "alias-name-field",
        source:
          "type A = long; struct Q { a: long, } frame main() { local q: Q = Q { a: A }; q; }",
        code: "BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH",
      },
      {
        name: "bitwise-not-array",
        source:
          "frame main() { local a: int[2] = [1, 2]; local b: int[2] = ~a; b; }",
        code: "BPL_BITWISE_NOT_OPERAND_TYPE_MISMATCH",
      },
    ]);
  });

  // spec: R-CONV-8
  test("an integer constant converts to no pointer or array", () => {
    expectCheckDiagnostics([
      ...[
        ["array", "int[2]"],
        ["nested-array", "int[2][2]"],
        ["slice", "int[]"],
        ["pointer", "*int"],
      ].flatMap(([name, type]) => [
        {
          name: `assign-${name}`,
          source: `frame main() { local x: ${type}; x = 5; x; }`,
          code: "BPL_ASSIGNMENT_TYPE_MISMATCH",
        },
        {
          name: `return-${name}`,
          source: `frame f() ret ${type} { return 5; } frame main() { f(); }`,
          code: "BPL_RETURN_TYPE_MISMATCH",
        },
      ]),
      {
        name: "assign-zero-array",
        source: "frame main() { local x: int[2]; x = 0; x; }",
        code: "BPL_ASSIGNMENT_TYPE_MISMATCH",
      },
      {
        name: "return-zero-pointer",
        source: "frame f() ret *int { return 0; } frame main() { f(); }",
        code: "BPL_RETURN_TYPE_MISMATCH",
      },
      {
        name: "assign-field-of-generic",
        source:
          "struct C<T> { val: int[2][2], t: T, } frame main() { local c: C<int>; c.val = 10; c; }",
        code: "BPL_ASSIGNMENT_TYPE_MISMATCH",
      },
    ]);
  });
});
