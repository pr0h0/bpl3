import { describe, expect, test } from "bun:test";

import {
  expectCorrectnessSuite,
  runBplAtOptimization,
} from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// Executable checks for LANGUAGE_SPEC.md sections 5 through 7.2.

describe("language specification: declarations", () => {
  // spec: R-DECL-2, R-DECL-3, R-DECL-4, R-DECL-5, R-DECL-6, R-DECL-8, R-DECL-9, R-DECL-10
  test("variables, aliases, destructuring, constants, and scopes", () => {
    expectCorrectnessSuite([
      {
        name: "declarations",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
global counter: int = 5;
global zeroed: int;
global const LIMIT: int = 100;
type ID = int;
type Point2D = (int, int);
type Callback = Func<int>(int);
type SortFunc<T> = Func<int>(T, T);
frame inc(x: int) ret int { return x + 1; }
frame compare(a: int, b: int) ret int { return a - b; }
frame pair() ret (int, bool) { return (4, true); }
frame poke(data: const *int) { *data = 9; }
frame main() ret int {
  local later: int;
  later = 3;
  local _unusedButAllowed: int = 0;
  local id: ID = 3;
  local plain: int = id;
  local point: Point2D = (1, 2);
  local callback: Callback = inc;
  local sorter: SortFunc<int> = compare;
  printf("%d %d %d %d %d %d\\n", later, plain, point.1, callback(1), sorter(5, 3), zeroed);
  local (a: int, b: bool) = pair();
  local (c: int, _) = pair();
  local (x: int, y: int) = (1, 2);
  (x, y) = (y, x);
  printf("%d %d %d %d %d\\n", a, b, c, x, y);
  local value: int = 1;
  local const ptr: *int = &value;
  *ptr = 5;
  printf("%d ", value);
  poke(&value);
  printf("%d %d\\n", value, LIMIT);
  local shadow: int = 10;
  if (true) { local shadow: int = 20; printf("%d ", shadow); }
  local counter: int = 2;
  printf("%d %d\\n", shadow, counter);
  return 0;
}`,
        expectedStdout: "3 3 2 2 2 0\n4 1 4 2 1\n5 9 100\n20 10 2\n",
      },
    ]);
  }, 120000);

  // spec: R-DECL-1, R-DECL-3, R-DECL-5, R-DECL-7, R-DECL-9, R-DECL-10
  test("rejects invalid declarations", () => {
    const main = (body: string) =>
      `extern printf(fmt: string, ...);\nstruct P { x: int, }\nframe main() ret int {\n${body}\nreturn 0;\n}\n`;
    expectCheckDiagnostics([
      {
        name: "missing-annotation",
        source: main('local x = 5; printf("%d", x);'),
        code: "BPL_VARIABLE_TYPE_ANNOTATION_MISSING",
      },
      {
        name: "unused-local",
        source: main("local x: int = 5;"),
        message: "Unused variable 'x'",
      },
      {
        name: "unused-parameter",
        source:
          "frame f(a: int) ret int { return 0; }\nframe main() ret int { return f(1); }\n",
        message: "Unused variable 'a'",
      },
      {
        name: "untyped-destructuring",
        source: main('local (a, b) = (1, 2); printf("%d %d", a, b);'),
        message: "Missing type annotation for variable 'a' in destructuring",
      },
      {
        name: "const-local",
        source: main(
          'local const PI: float = 3.14; PI = 3.0; printf("%f", PI);',
        ),
        code: "BPL_ASSIGNMENT_TARGET_CONSTANT",
      },
      {
        name: "const-global",
        source:
          "global const MAX: int = 1;\nframe main() ret int { MAX = 2; return MAX; }\n",
        code: "BPL_ASSIGNMENT_TARGET_CONSTANT",
      },
      {
        name: "const-parameter",
        source:
          "frame f(data: const *int) ret int { data = nullptr; return 0; }\nframe main() ret int { return f(nullptr); }\n",
        code: "BPL_ASSIGNMENT_TARGET_CONSTANT",
      },
      {
        name: "const-compound",
        source: main('local const n: int = 1; n += 1; printf("%d", n);'),
        code: "BPL_ASSIGNMENT_TARGET_CONSTANT",
      },
      {
        name: "const-increment",
        source: main('local const n: int = 1; n++; printf("%d", n);'),
        code: "BPL_ASSIGNMENT_TARGET_CONSTANT",
      },
      {
        name: "const-struct-field",
        source: main(
          'local const p: P = P { x: 1 }; p.x = 2; printf("%d", p.x);',
        ),
        code: "BPL_ASSIGNMENT_TARGET_CONSTANT",
      },
      {
        name: "block-scope",
        source: main(
          'if (true) { local y: int = 1; printf("%d", y); } printf("%d", y);',
        ),
        code: "BPL_SYMBOL_NOT_FOUND",
      },
      {
        name: "loop-header-scope",
        source:
          "frame main() ret int { loop (local j: int = 0; j < 3; j = j + 1) { } return j; }\n",
        code: "BPL_SYMBOL_NOT_FOUND",
      },
      {
        name: "same-scope-redeclaration",
        source: main('local x: int = 1; local x: int = 2; printf("%d", x);'),
        code: "BPL_VARIABLE_REDECLARATION",
      },
      {
        name: "parameter-redeclaration",
        source:
          "frame f(x: int) ret int { local x: int = 2; return x; }\nframe main() ret int { return f(1); }\n",
        code: "BPL_VARIABLE_REDECLARATION",
      },
    ]);
  }, 120000);
});

describe("language specification: functions", () => {
  // spec: R-FN-1, R-FN-3, R-FN-4, R-FN-5, R-FN-6, R-FN-7, R-FN-8
  test("declarations, argument passing, evaluation order, overloads, and generics", () => {
    expectCorrectnessSuite([
      {
        name: "functions",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct Box { value: int, }
frame trace(x: int) ret int { printf("%d ", x); return x; }
frame three(a: int, b: int, c: int) ret int { return a + b + c; }
frame mutate(box: Box, values: int[2], scalar: int) ret int { box.value = 9; values[0] = 9; scalar = 9; return box.value + values[0] + scalar; }
frame mutateThrough(box: *Box) { box.value = 7; }
frame show(_x: int) { printf("int "); }
frame show(_x: double) { printf("double "); }
frame show(_x: int, _y: int) { printf("pair "); }
frame identity<T>(value: T) ret T { local copy: T = value; return copy; }
frame second<A, B>(_a: A, b: B) ret B { return b; }
frame main() ret int {
  printf("%d\\n", laterDeclared(2));
  local box: Box = Box { value: 1 };
  local values: int[2] = [1, 2];
  local scalar: int = 1;
  printf("%d %d %d %d ", mutate(box, values, scalar), box.value, values[0], scalar);
  mutateThrough(&box);
  printf("%d\\n", box.value);
  local sum: int = three(trace(1), trace(2), trace(3));
  local mixed: int = trace(4) + trace(5) * trace(6);
  printf("%d %d\\n", sum, mixed);
  show(1); show(2.5); show(1, 2);
  printf("%d %f %d\\n", identity<int>(4), identity<double>(2.5), second<bool, int>(true, 9));
  return 0;
}
frame laterDeclared(x: int) ret int { return x * 3; }`,
        expectedStdout:
          "6\n27 1 1 1 7\n1 2 3 4 5 6 6 34\nint double pair 4 2.500000 9\n",
      },
    ]);
    for (const level of [0, 3] as const) {
      const result = runBplAtOptimization(
        "frame main() ret int { return 7; }",
        level,
      );
      expect(result.exitCode).toBe(7);
    }
  }, 120000);

  // spec: R-FN-2, R-FN-7, R-FN-8, R-FN-9
  test("rejects invalid returns, return-only overloads, and generic misuse", () => {
    expectCheckDiagnostics([
      {
        name: "missing-return-path",
        source:
          "frame f(x: int) ret int { if (x > 0) { return 1; } }\nframe main() ret int { return f(1); }\n",
        message: "may not return a value on all code paths",
      },
      {
        name: "void-returns-value",
        source:
          "frame f() { return 1; }\nframe main() ret int { f(); return 0; }\n",
        code: "BPL_RETURN_TYPE_MISMATCH",
      },
      {
        name: "return-type-only-overload",
        source:
          "frame f() ret int { return 1; }\nframe f() ret long { return 1; }\nframe main() ret int { return f(); }\n",
        code: "BPL_SYMBOL_ALREADY_DEFINED",
      },
      {
        name: "generic-inference",
        source:
          "frame identity<T>(v: T) ret T { return v; }\nframe main() ret int { return identity(1); }\n",
        code: "BPL_CALL_ARGUMENT_COUNT_MISMATCH",
      },
      {
        name: "generic-arity",
        source:
          "frame identity<T>(v: T) ret T { return v; }\nframe main() ret int { return identity<int, int>(1); }\n",
        code: "BPL_CALL_ARGUMENT_COUNT_MISMATCH",
      },
      {
        name: "unsatisfied-constraint",
        source: `spec Drawable { frame draw(this: *Self) ret int; }
struct Shape { id: int, }
frame render<T: Drawable>(item: *T) ret int { return item.draw(); }
frame main() ret int { local s: Shape = Shape { id: 1 }; return render<Shape>(&s); }
`,
        message: "does not satisfy constraint 'Drawable'",
      },
    ]);
  }, 120000);
});

describe("language specification: structs, specs, and enums", () => {
  // spec: R-STRUCT-1, R-STRUCT-2, R-STRUCT-3, R-STRUCT-4, R-STRUCT-5, R-STRUCT-7, R-STRUCT-8, R-STRUCT-9, R-STRUCT-10, R-SPEC-1, R-SPEC-2, R-SPEC-3, R-FN-9, R-ENUM-1, R-ENUM-2
  test("layout, dispatch, generics, specs, and enum values", () => {
    expectCorrectnessSuite([
      {
        name: "structs-specs-enums",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct Plain { x: int, }
struct Mixed { a: char, b: long, c: short }
struct Node { value: int, next: *Node, }
struct Point {
  x: int,
  y: int,
  frame new(x: int, y: int) ret Point { return Point { x: x, y: y }; }
  frame lengthSquared(this: *Point) ret int { return this.x * this.x + this.y * this.y; }
  frame name(this: *Point) ret string { return "point"; }
  frame byValue(this: Point) ret int { return this.x; }
}
struct Point3D : Point {
  z: int,
  frame name(this: *Point3D) ret string { return "point3d"; }
}
struct Box<T> {
  val: T,
  frame get(this: *Box<T>) ret T { return this.val; }
  frame pair<X>(this: *Box<T>, other: X) ret (T, X) { return (this.val, other); }
}
spec Drawable { frame draw(this: *Self) ret int; }
spec Named { frame name(this: *Self) ret string; }
struct Shape { id: int, }
struct Circle : Shape, Drawable, Named {
  radius: int,
  frame draw(this: *Circle) ret int { return this.radius * 2; }
  frame name(this: *Circle) ret string { return "circle"; }
}
struct Base : Drawable { id: int, frame draw(this: *Base) ret int { return this.id; } }
struct Derived : Base { extra: int, }
enum Color { Red, Green, Blue }
enum Tagged { Num(int), Pair(int, int), Pt { x: int, y: int }, Empty }
enum Option<T> { Some(T), None }
frame describe(p: *Point) ret string { return p.name(); }
frame render<T: Drawable>(item: *T) ret int { return item.draw(); }
frame label<T: Named>(item: *T) ret string { return item.name(); }
frame main() ret int {
  local plain: Plain = Plain { x: 1 };
  printf("%d %d %d %d %d %d %d\\n", sizeof(plain), sizeof(Mixed), offsetof(Mixed, b), offsetof(Mixed, c), sizeof(Point), sizeof(Shape), sizeof(Circle));
  local typed: *Type = &plain;
  local partial: Point3D = Point3D { z: 9 };
  local p: Point = Point.new(3, 4);
  local q: Point3D = Point3D { x: 1, y: 2, z: 3, };
  local sliced: Point = q;
  printf("%d %d %d %s %s %s %s %d\\n", p.lengthSquared(), q.lengthSquared(), q.z, describe(&p), describe(&q), sliced.name(), q.name(), p.byValue());
  local tail: Node = Node { value: 2, next: nullptr };
  local head: Node = Node { value: 1, next: &tail };
  printf("%d %d %d %d %d\\n", head.next.value, typed != nullptr, partial.x, partial.y, partial.z);
  local box: Box<int> = Box<int> { val: 5 };
  local (first: int, second: double) = box.pair<double>(2.5);
  printf("%d %d %f\\n", box.get(), first, second);
  local circle: Circle = Circle { id: 1, radius: 4 };
  local derived: Derived = Derived { id: 7, extra: 0 };
  printf("%d %s %d %d\\n", render<Circle>(&circle), label<Circle>(&circle), render<Derived>(&derived), derived.extra);
  local color: Color = Color.Blue;
  local tagged: Tagged = Tagged.Pt { x: 3, y: 4 };
  local pairValue: Tagged = Tagged.Pair(5, 6);
  local some: Option<int> = Option<int>.Some(8);
  local sum: int = match (tagged) { Tagged.Num(n) => n, Tagged.Pair(a, b) => a + b, Tagged.Pt { x: px, y: py } => px + py, Tagged.Empty => 0, };
  local pairSum: int = match (pairValue) { Tagged.Pair(a, b) => a + b, _ => 0, };
  local unwrapped: int = match (some) { Option<int>.Some(v) => v, Option<int>.None => 0, };
  printf("%d %d %d %d %d\\n", color == Color.Blue, color != Color.Red, sum, pairSum, unwrapped);
  return 0;
}`,
        expectedStdout:
          "4 24 8 16 16 16 16\n25 5 3 point point3d point point3d 3\n2 1 0 0 9\n5 5 2.500000\n8 circle 7 0\n1 1 7 11 8\n",
      },
    ]);
  }, 120000);

  // spec: R-STRUCT-1, R-STRUCT-2, R-STRUCT-3, R-STRUCT-6, R-STRUCT-9, R-SPEC-2, R-ENUM-2
  test("rejects invalid struct, spec, and enum usage", () => {
    expectCheckDiagnostics([
      {
        name: "visibility-modifier",
        source:
          "struct P { public x: int, }\nframe main() ret int { local p: P = P { x: 1 }; return p.x; }\n",
        message: "Unexpected syntax",
      },
      {
        name: "static-call-without-receiver",
        source:
          "struct X { v: int, frame get(this: *X) ret int { return this.v; } }\nframe main() ret int { return X.get(); }\n",
        code: "BPL_CALL_ARGUMENT_COUNT_MISMATCH",
      },
      {
        name: "missing-field",
        source:
          "struct A { x: int, y: int, }\nframe main() ret int { local a: A = A { x: 1 }; return a.x; }\n",
        code: "BPL_STRUCT_LITERAL_FIELD_MISSING",
      },
      {
        name: "unknown-field",
        source:
          "struct A { x: int, }\nframe main() ret int { local a: A = A { x: 1, q: 2 }; return a.x; }\n",
        code: "BPL_STRUCT_LITERAL_FIELD_UNKNOWN",
      },
      {
        name: "two-parent-structs",
        source:
          "struct A { x: int, }\nstruct B { y: int, }\nstruct C : A, B { z: int, }\nframe main() ret int { local c: C = C { x: 1, z: 3 }; return c.z; }\n",
        message: "cannot inherit from more than one struct",
      },
      {
        name: "parent-after-spec",
        source:
          "spec S { frame f(this: *Self) ret int; }\nstruct A { x: int, }\nstruct C : S, A { z: int, frame f(this: *C) ret int { return this.z; } }\nframe main() ret int { local c: C = C { z: 3 }; return c.f(); }\n",
        message: "must be listed first",
      },
      {
        name: "recursive-value-field",
        source: "struct N { next: N, }\nframe main() ret int { return 0; }\n",
        code: "BPL_TYPE_RECURSION_CYCLE",
      },
      {
        name: "spec-method-missing",
        source:
          "spec Drawable { frame draw(this: *Self) ret int; }\nstruct Circle : Drawable { r: int, }\nframe main() ret int { local c: Circle = Circle { r: 1 }; return c.r; }\n",
        message: "does not implement method 'draw' from spec 'Drawable'",
      },
      {
        name: "spec-parameter-count",
        source:
          "spec Drawable { frame draw(this: *Self, scale: int) ret int; }\nstruct Circle : Drawable { r: int, frame draw(this: *Circle) ret int { return this.r; } }\nframe main() ret int { local c: Circle = Circle { r: 1 }; return c.draw(); }\n",
        message: "has incorrect parameter count",
      },
      {
        name: "integer-to-enum",
        source:
          "enum Color { Red, Green }\nframe main() ret int { local c: Color = 1; if (c == Color.Red) { return 1; } return 0; }\n",
        message: "cannot assign i32 to Color",
      },
      {
        name: "enum-cast-to-integer",
        source:
          "enum Color { Red, Green }\nframe main() ret int { local c: Color = Color.Green; return cast<int>(c); }\n",
        code: "BPL_CAST_INVALID",
      },
    ]);
  }, 120000);
});
