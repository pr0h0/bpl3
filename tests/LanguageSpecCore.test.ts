import { describe, test } from "bun:test";

import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

// Executable checks for LANGUAGE_SPEC.md sections 1 and 2. Each test lists the
// rule IDs it covers; tests/LanguageSpecRules.test.ts enforces the mapping.

describe("language specification: lexical structure", () => {
  // spec: R-LEX-1, R-LEX-2, R-LEX-3, R-LEX-4, R-LEX-5, R-LEX-6, R-LEX-7, R-LEX-8, R-LEX-9, R-LEX-10, R-LEX-11
  test("comments, identifiers, and literal forms", () => {
    expectCorrectnessSuite([
      {
        name: "literal-forms",
        validateLlvm: true,
        source: `import [String] from "std";
extern printf(fmt: string, ...);
/# outer /# nested #/ still inside the outer comment #/
frame main() ret int { # trailing comment
  local _snake_Case9: int = 0xFF + 0XF;
  local bin: int = 0b101 + 0B1;
  local oct: int = 0o17 + 0O1;
  local sep: int = 1_000_000;
  local frac: double = 1_0.2_5;
  local ch: char = 'c';
  local nl: char = '\\n';
  local text: string = "q\\"\\t\\\\|\\x41|\\'";
  local flag: bool = true;
  local p: *int = null;
  local q: *int = nullptr;
  local big: long = 3000000000;
  local x: int = 5;
  local s: String = \`Value: \${x + 1}!\`;
  printf("%d %d %d %d %f\\n", _snake_Case9, bin, oct, sep, frac);
  printf("%d %d %s %d %d %d\\n", ch, nl, text, flag, false, p == q);
  printf("%ld %d %d %d\\n", big, sizeof(3000000000), sizeof(2147483647), sizeof(3.5));
  printf("%s\\n", s.data);
  s.destroy();
  return 0;
}`,
        expectedStdout:
          "270 6 16 1000000 10.250000\n99 10 q\"\t\\|A|' 1 0 1\n3000000000 8 4 8\nValue: 6!\n",
      },
    ]);
  }, 120000);

  // spec: R-LEX-3, R-LEX-5, R-LEX-6, R-LEX-9, R-LEX-11
  test("rejects malformed literals, keywords as identifiers, and missing String", () => {
    const main = (body: string) =>
      `extern printf(fmt: string, ...);\nframe main() ret int {\n${body}\nreturn 0;\n}\n`;
    expectCheckDiagnostics([
      {
        name: "keyword-identifier",
        source: main('local loop: int = 1; printf("%d", loop);'),
        message: "Unexpected syntax",
      },
      {
        name: "spaced-digits",
        source: main('local d: int = 1 2; printf("%d", d);'),
        message: "Unexpected syntax",
      },
      {
        name: "spaced-fraction",
        source: main('local d: double = 1.5 5; printf("%f", d);'),
        message: "Unexpected syntax",
      },
      {
        name: "trailing-separator",
        source: main('local d: int = 1_; printf("%d", d);'),
        message: "Unexpected syntax",
      },
      {
        name: "hex-separator",
        source: main('local d: int = 0xF_F; printf("%d", d);'),
        message: "Unexpected syntax",
      },
      {
        name: "exponent",
        source: main('local d: double = 1e3; printf("%f", d);'),
        message: "Unexpected syntax",
      },
      {
        name: "leading-dot",
        source: main('local d: double = .5; printf("%f", d);'),
        message: "Unexpected syntax",
      },
      {
        name: "multi-char",
        source: main("local c: char = 'ab'; printf(\"%d\", c);"),
        message: "Character literal must contain exactly one character",
      },
      {
        name: "interpolation-without-string",
        source: main('local x: int = 1; printf("%d", `v${x}`);'),
        code: "BPL_SYMBOL_NOT_FOUND",
      },
    ]);
  }, 120000);
});

describe("language specification: primitive types", () => {
  // spec: R-TYPE-1, R-TYPE-2, R-TYPE-3, R-TYPE-4, R-TYPE-5, R-TYPE-6, R-TYPE-7, R-TYPE-8, R-TYPE-9, R-TYPE-11, R-TYPE-12, R-TYPE-13, R-TYPE-15
  test("widths, floating-point behavior, null, wrapping, and shifts", () => {
    expectCorrectnessSuite([
      {
        name: "primitive-commitments",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
frame add(a: int, b: int) ret int { return a + b; }
frame mul(a: long, b: long) ret long { return a * b; }
frame shl(v: int, n: int) ret int { return v << n; }
frame shr(v: int, n: int) ret int { return v >> n; }
frame ushr(v: uint, n: int) ret uint { return v >> n; }
frame main() ret int {
  printf("%d %d %d %d %d %d %d %d\\n", sizeof(int), sizeof(uint), sizeof(long), sizeof(ulong), sizeof(short), sizeof(ushort), sizeof(char), sizeof(uchar));
  local a: i32 = -1; local b: int = a; local c: u32 = cast<uint>(b);
  local d: i64 = 5; local e: long = d; local f: i16 = 7; local g: short = f;
  local h: i8 = 3; local i: char = h; local j: u8 = 250; local k: uchar = j;
  printf("%u %ld %d %d %d\\n", c, e, g, i, k);
  printf("%d %d %d %d\\n", sizeof(bool), sizeof(float), sizeof(double), sizeof(f64));
  local dd: double = 1.5; local ff: float = dd; local f6: f64 = ff;
  local f3: f32 = cast<f32>(f6);
  printf("%d %f\\n", sizeof(f32), cast<double>(f3));
  local zero: double = 0.0;
  local negZero: double = -zero;
  local nan: double = zero / zero;
  printf("%f %d %d %d\\n", 1.0 / negZero, negZero == zero, nan == nan, nan != nan);
  local p: *int = null;
  local s: string = "text";
  printf("%d %s\\n", p == nullptr, s);
  printf("%d %ld\\n", add(2147483647, 1), mul(9223372036854775807, 2));
  printf("%d %d %d %u\\n", shl(1, 32), shl(1, 33), shr(-8, 1), ushr(4294967295, 31));
  return 0;
}`,
        expectedStdout:
          "4 4 8 8 2 2 1 1\n4294967295 5 7 3 250\n1 8 8 8\n4 1.500000\n-inf 1 0 1\n1 text\n-2147483648 -2\n1 2 -4 1\n",
      },
    ]);
  }, 120000);

  // spec: R-TYPE-14
  test("integer division failures", () => {
    expectRuntimeFailureSuite([
      {
        name: "division-by-zero",
        expectedMessage: "Division by zero",
        source: `extern printf(fmt: string, ...);
frame rem(a: int, b: int) ret int { return a % b; }
frame main() ret int { printf("%d\\n", rem(1, 0)); return 0; }`,
      },
      {
        name: "division-overflow",
        expectedMessage: "Integer division overflow",
        source: `extern printf(fmt: string, ...);
frame div(a: int, b: int) ret int { return a / b; }
frame main() ret int { printf("%d\\n", div(-2147483647 - 1, -1)); return 0; }`,
      },
    ]);
  }, 120000);

  // spec: R-TYPE-7, R-TYPE-10, R-TYPE-11, R-TYPE-15
  test("rejects f32 mixing, void sizes, null structs, and invalid shift counts", () => {
    const main = (body: string) =>
      `extern printf(fmt: string, ...);\nstruct Point { x: int, }\nframe main() ret int {\n${body}\nreturn 0;\n}\n`;
    expectCheckDiagnostics([
      {
        name: "f32-literal",
        source: main('local h: f32 = 1.5; printf("%f", cast<double>(h));'),
        message: "cannot assign double to f32",
      },
      {
        name: "f32-assign",
        source: main(
          'local d: double = 1.5; local h: f32 = d; printf("%f", cast<double>(h));',
        ),
        message: "cannot assign double to f32",
      },
      {
        name: "f32-binary",
        source: main(
          'local h: f32 = cast<f32>(1.5); local d: double = 2.0; printf("%f", d + h);',
        ),
        code: "BPL_BINARY_OPERAND_TYPE_MISMATCH",
      },
      {
        name: "sizeof-void",
        source: main('printf("%d", sizeof(void));'),
        code: "BPL_SIZEOF_VOID_INVALID",
      },
      {
        name: "null-struct",
        source: main('local p: Point = null; printf("%d", p.x);'),
        message: "cannot assign nullptr to Point",
      },
      {
        name: "shift-too-wide",
        source: main('local x: int = 1 << 32; printf("%d", x);'),
        code: "BPL_SHIFT_COUNT_INVALID",
      },
      {
        name: "shift-negative",
        source: main('local x: int = 1 << -1; printf("%d", x);'),
        code: "BPL_SHIFT_COUNT_INVALID",
      },
    ]);
  }, 120000);
});

describe("language specification: arrays, pointers, and slices", () => {
  // spec: R-ARR-1, R-ARR-2, R-ARR-3, R-ARR-4, R-ARR-7, R-ARR-8, R-ARR-9, R-DECL-4
  test("array values, pointer arithmetic, and slice views", () => {
    expectCorrectnessSuite([
      {
        name: "array-slice-semantics",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
type IntSlice = int[];
frame bumpCopy(values: int[3]) ret int { values[0] = 100; return values[0]; }
frame bumpView(values: int[]) { values[0] = values[0] + 10; }
frame total(values: IntSlice) ret int { return values[0] + values[1] + values[2]; }
frame main() ret int {
  local a: int[3] = [1, 2, 3];
  local copy: int[3] = a;
  copy[1] = 50;
  printf("%d %d %d %d\\n", sizeof(a), bumpCopy(a), a[0], a[1]);
  local view: int[] = a;
  view[2] = 30;
  bumpView(a);
  local aliased: IntSlice = a;
  printf("%d %d %d %d %d\\n", a[0], a[2], total(a), aliased[1], copy[1]);
  local literal: int[] = [7, 8, 9];
  local p: *int = &a[0];
  local q: *int = p + 2;
  printf("%d %d %d %d\\n", literal[2], *q, p[1], *(q - 1));
  return 0;
}`,
        expectedStdout: "12 100 1 2\n11 30 43 2 50\n9 30 2 2\n",
      },
    ]);
  }, 120000);

  // spec: R-ARR-5, R-ARR-6, R-ARR-10
  test("bounds and null-access failures", () => {
    expectRuntimeFailureSuite([
      {
        name: "fixed-array-bounds",
        expectedMessage: "Array index 3 is out of bounds for size 3",
        source: `extern printf(fmt: string, ...);
frame main() ret int { local a: int[3] = [1, 2, 3]; local i: int = 3; printf("%d\\n", a[i]); return 0; }`,
      },
      {
        name: "slice-bounds",
        expectedMessage: "Array index 3 is out of bounds for size 3",
        source: `extern printf(fmt: string, ...);
frame read(s: int[], i: int) ret int { return s[i]; }
frame main() ret int { local a: int[3] = [1, 2, 3]; printf("%d\\n", read(a, 3)); return 0; }`,
      },
      {
        name: "null-member-access",
        expectedMessage: "Attempted to access member of nullptr",
        source: `extern printf(fmt: string, ...);
struct Node { value: int, }
frame main() ret int { local n: *Node = nullptr; printf("%d\\n", n.value); return 0; }`,
      },
    ]);
  }, 120000);
});

describe("language specification: conversions", () => {
  // spec: R-CONV-1, R-CONV-2, R-CONV-4, R-CONV-5, R-CONV-7, R-CONV-8, R-CONV-9, R-CONV-10
  test("implicit and explicit conversions", () => {
    expectCorrectnessSuite([
      {
        name: "conversion-semantics",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
struct Parent { x: int, frame name(this: *Parent) ret string { return "parent"; } }
struct Child : Parent { y: int, frame name(this: *Child) ret string { return "child"; } }
frame twice(v: int) ret int { return v * 2; }
frame toInt(d: double) ret int { return cast<int>(d); }
frame toUint(d: double) ret uint { return cast<uint>(d); }
frame narrow(v: long) ret int { return v; }
frame main() ret int {
  local u: uint = 4294967295;
  local asInt: int = u;
  local asLong: long = u;
  local neg: int = -1;
  local asUlong: ulong = neg;
  local two: int = 2;
  local asBool: bool = two;
  local one: int = true;
  printf("%d %ld %lu %d %d %d\\n", asInt, asLong, asUlong, asBool, one, narrow(4294967297));
  local small: char = 100;
  local wide: int = 100;
  local wideLong: long = 4294967297;
  local narrowResult: int = small + wide;
  local wideResult: int = wide + small;
  local stillNarrow: long = 1 + wideLong;
  printf("%d %d %d %ld\\n", narrowResult, wideResult, wide > small, stillNarrow);
  local arr: int[3] = [4, 5, 6];
  local decayed: *int = arr;
  local sliced: int[] = arr;
  printf("%d %d\\n", decayed[2], sliced[1]);
  local child: Child = Child { x: 1, y: 2 };
  local parentValue: Parent = child;
  local parentPtr: *Parent = &child;
  printf("%d %d %s %s\\n", parentValue.x, sizeof(parentValue), parentPtr.name(), parentValue.name());
  local value: int = 9;
  local erased: *void = &value;
  local typed: *int = erased;
  printf("%d\\n", *typed);
  local f: Func<int>(int) = twice;
  local l: Lambda<int>(int) = twice;
  printf("%d %d\\n", f(3), l(4));
  local big: double = 10000000000.0;
  local zero: double = 0.0;
  printf("%d %d %d %d %d %u\\n", cast<int>(3.9), (-3.9 as int), toInt(big), toInt(-big), toInt(zero / zero), toUint(-5.0));
  printf("%d %d %f\\n", cast<int>(wideLong), cast<short>(65537), cast<double>(value));
  return 0;
}`,
        expectedStdout:
          "-1 4294967295 18446744073709551615 0 1 1\n-56 200 0 2\n6 5\n1 16 child parent\n9\n6 8\n3 -3 2147483647 -2147483648 0 0\n1 1 9.000000\n",
      },
    ]);
  }, 120000);

  // spec: R-CONV-3, R-CONV-4, R-CONV-5, R-CONV-6, R-CONV-7, R-CONV-8, R-CONV-9, R-CONV-10
  test("rejects conversions outside the implicit set", () => {
    const main = (body: string) =>
      `extern printf(fmt: string, ...);\nstruct P { x: int, }\nstruct C : P { y: int, }\nframe apply(f: Func<int>(int), v: int) ret int { return f(v); }\nframe main() ret int {\n${body}\nreturn 0;\n}\n`;
    expectCheckDiagnostics([
      {
        name: "int-to-float",
        source: main('local i: int = 5; local g: float = i; printf("%f", g);'),
        message: "cannot assign i32 to double",
      },
      {
        name: "int-literal-to-float",
        source: main('local g: float = 1; printf("%f", g);'),
        message: "cannot assign i32 to double",
      },
      {
        name: "float-to-int",
        source: main(
          'local f: float = 2.5; local i: int = f; printf("%d", i);',
        ),
        message: "cannot assign double to i32",
      },
      {
        name: "decay-wrong-element",
        source: main(
          'local a: int[3] = [1, 2, 3]; local p: *long = a; printf("%d", *p);',
        ),
        message: "cannot assign i32[3] to *i64",
      },
      {
        name: "slice-wrong-element",
        source: main(
          'local a: int[3] = [1, 2, 3]; local s: long[] = a; printf("%d", s[0]);',
        ),
        message: "cannot assign i32[3] to i64[]",
      },
      {
        name: "slice-to-pointer",
        source: main(
          'local a: int[3] = [1, 2, 3]; local s: int[] = a; local p: *int = s; printf("%d", *p);',
        ),
        message: "cannot assign i32[] to *i32",
      },
      {
        name: "slice-to-array",
        source: main(
          'local a: int[3] = [1, 2, 3]; local s: int[] = a; local b: int[3] = s; printf("%d", b[0]);',
        ),
        message: "cannot assign i32[] to i32[3]",
      },
      {
        name: "parent-to-child",
        source: main(
          'local p: P = P { x: 1 }; local c: C = p; printf("%d", c.y);',
        ),
        message: "cannot assign P to C",
      },
      {
        name: "parent-pointer-to-child",
        source: main(
          'local p: P = P { x: 1 }; local c: *C = &p; printf("%d", c.y);',
        ),
        message: "cannot assign *P to *C",
      },
      {
        name: "pointer-pointee-mismatch",
        source: main(
          'local i: int = 3; local p: *long = &i; printf("%d", *p);',
        ),
        message: "cannot assign *i32 to *i64",
      },
      {
        name: "pointer-to-integer",
        source: main(
          'local p: *int = nullptr; local i: long = p; printf("%d", i);',
        ),
        message: "cannot assign *i32 to i64",
      },
      {
        name: "lambda-to-func",
        source: main(
          'local f: Func<int>(int) = |x: int| ret int { return x; }; printf("%d", f(1));',
        ),
        message: "cannot assign Lambda<i32>(i32) to Func<i32>(i32)",
      },
      {
        name: "lambda-argument-to-func",
        source: main('printf("%d", apply(|x: int| ret int { return x; }, 1));'),
        code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      },
      {
        name: "integer-to-string-cast",
        source: main('local s: string = cast<string>(5); printf("%s", s);'),
        code: "BPL_CAST_INTEGER_TO_STRING",
      },
    ]);
  }, 120000);
});
