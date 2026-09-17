import { describe, test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// Executable checks for LANGUAGE_SPEC.md section 9.

describe("language specification: operators", () => {
  // spec: R-EXPR-1, R-EXPR-2, R-EXPR-3, R-EXPR-4, R-EXPR-5, R-EXPR-6, R-EXPR-7, R-EXPR-8, R-EXPR-10, R-EXPR-11, R-EXPR-12, R-EXPR-13
  test("operator results, assignment, increments, precedence, and special expressions", () => {
    expectCorrectnessSuite([
      {
        name: "operators",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct Pair { x: int, y: int, }
struct A { x: int, frame f(this: *A) ret int { return this.x; } }
struct B : A { y: int, }
frame traceBool(v: bool) ret bool { printf("%d ", v); return v; }
frame traceInt(v: int) ret int { printf("t%d ", v); return v; }
frame isB(p: *A) ret bool { return p is *B; }
frame main() ret int {
  local a: int = 17; local b: int = 5; local n: int = -17;
  printf("%d %d %d %d %d %d %d\\n", a + b, a - b, a * b, a / b, a % b, n / b, n % b);
  local fl: double = 7.5; local fm: double = 2.0;
  printf("%f %f %f %f\\n", fl + fm, fl - fm, fl * fm, fl / fm);
  local both: bool = traceBool(false) && traceBool(true);
  local either: bool = traceBool(true) || traceBool(false);
  printf("%d %d %d\\n", both, either, !both);
  printf("%d %d %d %d %d %d\\n", a & b, a | b, a ^ b, ~a, a << 2, n >> 1);
  printf("%d %d %d %d %d %d\\n", a == b, a != b, a < b, a <= b, a > b, a >= b);
  local p1: Pair = Pair { x: 1, y: 2 }; local p2: Pair = Pair { x: 1, y: 2 }; local p3: Pair = Pair { x: 1, y: 3 };
  printf("%d %d %d\\n", p1 == p2, p1 != p3, p1 == p3);
  local c: int = 10;
  c += 5; c -= 3; c *= 2; c /= 4; c %= 4; c &= 12; c |= 1; c ^= 3;
  local x: int = 0; local y: int = 0;
  x = y = 7;
  local chainPair: Pair = Pair { x: 0, y: 0 };
  local chainArr: int[2] = [0, 0];
  chainPair.x = chainArr[1] = 4;
  local left: int = 1; local right: int = 2;
  left += right += 3;
  local grouped: int = (right = 9) + 1;
  printf("%d %d %d %d %d %d %d %d\\n", c, x, y, chainPair.x, chainArr[1], left, right, grouped);
  local i: int = 1;
  local pre: int = ++i; local preDec: int = --i; local post: int = i++; local postDec: int = i--;
  local f: double = 1.5; f++;
  local f3: f32 = cast<f32>(1.5); f3++; --f3;
  local pair: Pair = Pair { x: 1, y: 1 }; pair.x++;
  local arr: int[2] = [5, 6]; arr[1]--;
  local target: int = 1; local ptr: *int = &target; (*ptr)++; ++*ptr;
  local ch: char = 'a'; ch++;
  printf("%d %d %d %d %d %f %f %d %d %d %c\\n", pre, preDec, post, postDec, i, f, cast<double>(f3), pair.x, arr[1], target, ch);
  printf("%d %d %d %d %d\\n", 2 + 3 * 4, (2 + 3) * 4, 1 << 2 + 1, 10 - 4 - 3, 100 / 10 / 5);
  local cond: bool = true;
  local chosen: int = cond ? traceInt(1) : traceInt(2);
  printf("%d\\n", chosen);
  local value: int = 5;
  local pointer: *int = &value;
  *pointer = 6;
  local bVal: B = B { x: 1, y: 2 };
  local aVal: A = A { x: 3 };
  local wide: long = 3;
  printf("%d %d %d %d %d %d\\n", value, sizeof(int), sizeof(value), sizeof(Pair), sizeof(pair.x), sizeof(arr));
  printf("%d %d %d %d %d\\n", (wide is long), (value is long), isB(&bVal), isB(&aVal), aVal.f());
  printf("%d %d %d\\n", match<B>(bVal), match<A>(bVal), match<long>(value));
  return 0;
}`,
        expectedStdout:
          "22 12 85 3 2 -3 -2\n9.500000 5.500000 15.000000 3.750000\n0 1 0 1 1\n1 21 20 -18 68 -9\n0 1 0 0 1 1\n1 1 0\n2 7 7 4 4 6 9 10\n2 1 1 2 1 2.500000 1.500000 2 5 3 b\n14 20 8 3 2\nt1 1\n6 4 4 8 4 8\n1 0 1 0 3\n1 1 0\n",
      },
    ]);
  }, 120000);

  // spec: R-EXPR-1, R-EXPR-2, R-EXPR-3, R-EXPR-5, R-EXPR-6, R-EXPR-7, R-EXPR-8, R-EXPR-9
  test("rejects invalid operands, targets, and unsupported operators", () => {
    const main = (body: string) =>
      `extern printf(fmt: string, ...);\nframe main() ret int {\n${body}\nreturn 0;\n}\n`;
    expectCheckDiagnostics([
      {
        name: "float-modulo",
        source: main(
          'local f: double = 1.5; local g: double = f % 1.0; printf("%f", g);',
        ),
        code: "BPL_MODULO_OPERAND_TYPE_MISMATCH",
      },
      {
        name: "integer-logical",
        source: main(
          'local a: int = 1; local b: bool = a && true; printf("%d", b);',
        ),
        code: "BPL_LOGICAL_OPERAND_TYPE_MISMATCH",
      },
      {
        name: "integer-not",
        source: main('local a: int = 1; local b: bool = !a; printf("%d", b);'),
        code: "BPL_LOGICAL_NOT_OPERAND_TYPE_MISMATCH",
      },
      {
        name: "bool-bitwise",
        source: main(
          'local t: bool = true; local r: bool = t & false; printf("%d", r);',
        ),
        code: "BPL_BITWISE_OPERAND_TYPE_MISMATCH",
      },
      {
        name: "comparison-binds-tighter-than-and",
        source: main('printf("%d", 6 & 3 == 3);'),
        code: "BPL_BITWISE_OPERAND_TYPE_MISMATCH",
      },
      {
        name: "shift-assignment",
        source: main('local c: int = 1; c <<= 2; printf("%d", c);'),
        message: "Unexpected syntax",
      },
      {
        name: "assign-to-rvalue",
        source: main('local a: int = 1; (a + 1) = 3; printf("%d", a);'),
        code: "BPL_ASSIGNMENT_TARGET_INVALID",
      },
      {
        name: "increment-rvalue",
        source: main(
          'local a: int = 1; local b: int = (a + 1)++; printf("%d", b);',
        ),
        code: "BPL_ASSIGNMENT_TARGET_INVALID",
      },
      {
        name: "increment-literal",
        source: main('local b: int = 5++; printf("%d", b);'),
        code: "BPL_ASSIGNMENT_TARGET_INVALID",
      },
      {
        name: "increment-bool",
        source: main('local b: bool = true; b++; printf("%d", b);'),
        message: "Operator '++' cannot be applied",
      },
      {
        name: "increment-pointer",
        source: main(
          'local arr: int[2] = [1, 2]; local p: *int = &arr[0]; p++; printf("%d", *p);',
        ),
        message: "Operator '++' cannot be applied",
      },
      {
        name: "decrement-string",
        source: main('local s: string = "ab"; s--; printf("%s", s);'),
        message: "Operator '--' cannot be applied",
      },
      {
        name: "ternary-branch-mismatch",
        source: main(
          'local b: bool = true; local r: int = b ? 1 : "x"; printf("%d", r);',
        ),
        code: "BPL_TERNARY_BRANCH_TYPE_MISMATCH",
      },
      {
        name: "unary-plus",
        source: main('local a: int = 1; printf("%d", +a);'),
        code: "BPL_UNARY_PLUS_UNSUPPORTED",
      },
    ]);
  }, 120000);
});

describe("language specification: lambdas", () => {
  // spec: R-LAMBDA-1, R-LAMBDA-2, R-LAMBDA-3
  test("lambda syntax, by-value capture, and escaping closures", () => {
    expectCorrectnessSuite([
      {
        name: "lambdas",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
frame apply(f: Lambda<int>(int), x: int) ret int { return f(x); }
frame makeAdder(n: int) ret Lambda<int>(int) { return |x: int| ret int { return x + n; }; }
frame main() ret int {
  local k: int = 10;
  local add: Lambda<int>(int) = |x: int| ret int { return x + k; };
  local noArgs: Lambda<void>() = || { printf("void-lambda "); };
  local mutateCopy: Lambda<void>() = || { k = k + 1; };
  noArgs();
  mutateCopy();
  k = 20;
  local two: Lambda<int>(int, int) = |a: int, b: int| ret int { return a * b; };
  local adder: Lambda<int>(int) = makeAdder(3);
  printf("%d %d %d %d %d\\n", add(1), two(3, 4), apply(add, 2), adder(4), k);
  return 0;
}`,
        expectedStdout: "void-lambda 11 12 12 7 20\n",
      },
    ]);
  }, 120000);
});

describe("language specification: pattern matching", () => {
  // spec: R-MATCH-1, R-MATCH-2, R-MATCH-4
  test("literal, binding, tuple, enum, and block-arm patterns", () => {
    expectCorrectnessSuite([
      {
        name: "pattern-matching",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
enum Option<T> { Some(T), None }
enum Shape { Circle(int), Rect(int, int), Named { width: int }, Empty }
frame classify(x: int) ret string {
  return match (x) {
    0 => "zero",
    42 => "answer",
    n if n < 0 => "negative",
    _ => "other",
  };
}
frame firstArm(x: int) ret int { return match (x) { n if n > 0 => 1, 5 => 2, _ => 3, }; }
frame where(point: (int, int)) ret string {
  return match (point) {
    (0, 0) => "origin",
    (0, y) => "y-axis",
    (x, 0) => "x-axis",
    (x, y) if x == y => "diagonal",
    (x, y) => "other",
  };
}
frame unwrap(opt: Option<int>) ret int {
  return match (opt) { Option<int>.Some(val) => val, Option<int>.None => 0, };
}
frame unwrapShort(opt: Option<int>) ret int {
  return match (opt) { Option.Some(val) => val, Option.None => -1, };
}
frame area(s: Shape) ret int {
  return match (s) {
    Shape.Circle(r) => 3 * r * r,
    Shape.Rect(w, h) => w * h,
    Shape.Named { width: w } => w,
    Shape.Empty => 0,
  };
}
frame literals(s: string, c: char, b: bool, f: double) ret int {
  local a: int = match (s) { "hello" => 1, _ => 0, };
  local d: int = match (c) { 'A' => 1, _ => 0, };
  local e: int = match (b) { true => 1, false => 0, };
  local g: int = match (f) { 3.14 => 1, _ => 0, };
  return a + d * 10 + e * 100 + g * 1000;
}
frame blockArm(x: int) ret int {
  local r: int = match (x) { 3 => { local t: int = x * 2; return t; }, _ => 0, };
  return r + 1;
}
frame main() ret int {
  printf("%s %s %s %s %d\\n", classify(0), classify(42), classify(-5), classify(7), firstArm(5));
  printf("%s %s %s %s %s\\n", where((0, 0)), where((0, 3)), where((3, 0)), where((2, 2)), where((1, 2)));
  printf("%d %d %d %d %d %d %d\\n", unwrap(Option<int>.Some(9)), unwrap(Option<int>.None), unwrapShort(Option<int>.None), area(Shape.Circle(2)), area(Shape.Rect(2, 5)), area(Shape.Named { width: 4 }), area(Shape.Empty));
  printf("%d %d %d\\n", literals("hello", 'A', true, 3.14), literals("x", 'B', false, 1.0), blockArm(3));
  local x: int = 3;
  match (x) { 3 => { printf("statement\\n"); }, _ => { printf("other\\n"); }, }
  return 0;
}`,
        expectedStdout:
          "zero answer negative other 1\norigin y-axis x-axis diagonal other\n9 0 -1 12 10 4 0\n1111 0 7\nstatement\n",
      },
    ]);
  }, 120000);

  // spec: R-MATCH-4
  test("return in a match statement leaves the enclosing function", () => {
    expectCorrectnessSuite([
      {
        name: "match-statement-return",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
enum Shape { Circle(double), Empty }
frame described(s: Shape) ret int {
  match (s) {
    Shape.Circle(r) => { return cast<int>(r) * 2; },
    Shape.Empty => { printf("empty\\n"); },
  };
  return 42;
}
frame guarded(x: int) ret int {
  match (x) {
    n if n > 10 => { return n * 3; },
    _ => {},
  };
  return -1;
}
frame nested(s: Shape) ret int {
  match (s) {
    Shape.Circle(r) => {
      local doubled: int = match (cast<int>(r)) { 2 => { return 20; }, _ => 1, };
      return doubled + 5;
    },
    Shape.Empty => { return 0; },
  };
  return -7;
}
frame main() ret int {
  printf("%d %d\\n", described(Shape.Circle(4.0)), described(Shape.Empty));
  printf("%d %d\\n", guarded(11), guarded(2));
  printf("%d %d\\n", nested(Shape.Circle(2.0)), nested(Shape.Circle(7.0)));
  return 0;
}`,
        // Circle returns from inside the arm; Empty falls through to 42.
        expectedStdout: "empty\n8 42\n33 -1\n25 6\n",
      },
    ]);
  }, 120000);

  // spec: R-MATCH-3
  test("rejects non-exhaustive matches", () => {
    expectCheckDiagnostics([
      {
        name: "missing-default",
        source:
          "frame main() ret int { local x: int = 1; return match (x) { 0 => 1, 1 => 2, }; }\n",
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
      },
      {
        name: "missing-variant",
        source:
          "enum Shape { Circle(int), Empty }\nframe main() ret int { local s: Shape = Shape.Empty; return match (s) { Shape.Empty => 0, }; }\n",
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
      },
      {
        name: "guarded-catch-all",
        source:
          "frame main() ret int { local x: int = 1; return match (x) { n if n > 0 => 1, }; }\n",
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
      },
    ]);
  }, 120000);
});
