import { describe, it, test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

function matchOn(type: string, init: string, arms: string): string {
  return `frame main() ret int {\n    local x: ${type} = ${init};\n    return (match (x) { ${arms} });\n}\n`;
}

// BUG-482: literal patterns were never type-checked. `300` matched a `u8`
// holding 44 (the literal was truncated), and a string, float or `nullptr`
// literal on an integer produced invalid LLVM IR.
describe("literal match patterns", () => {
  test("must fit and have the matched value's type", () => {
    expectCheckDiagnostics([
      {
        name: "out-of-range",
        source: matchOn("u8", "cast<u8>(44)", "300 => 1, _ => 0"),
        code: "BPL_INTEGER_LITERAL_OVERFLOW",
        message: "Integer overflow: value 300 does not fit in type u8",
      },
      {
        name: "negative-out-of-range",
        source: matchOn("i8", "cast<i8>(1)", "-129 => 1, _ => 0"),
        code: "BPL_INTEGER_LITERAL_OVERFLOW",
        message: "Integer overflow: value -129 does not fit in type i8",
      },
      {
        name: "string-on-integer",
        source: matchOn("u8", "cast<u8>(1)", '"a" => 1, _ => 0'),
        code: "BPL_MATCH_LITERAL_PATTERN_TYPE_MISMATCH",
        message:
          'Literal pattern "a" of type string cannot match a value of type u8',
      },
      {
        name: "float-on-integer",
        source: matchOn("int", "1", "1.0 => 1, _ => 0"),
        code: "BPL_MATCH_LITERAL_PATTERN_TYPE_MISMATCH",
        message:
          "Literal pattern 1.0 of type double cannot match a value of type i32",
      },
      {
        name: "bool-on-integer",
        source: matchOn("int", "1", "true => 1, _ => 0"),
        code: "BPL_MATCH_LITERAL_PATTERN_TYPE_MISMATCH",
        message:
          "Literal pattern true of type bool cannot match a value of type i32",
      },
      {
        name: "integer-on-bool",
        source: matchOn("bool", "true", "1 => 1, _ => 0"),
        code: "BPL_MATCH_LITERAL_PATTERN_TYPE_MISMATCH",
        message:
          "Literal pattern 1 of type i32 cannot match a value of type bool",
      },
      {
        name: "nullptr-on-integer",
        source: matchOn("int", "1", "nullptr => 1, _ => 0"),
        code: "BPL_MATCH_LITERAL_PATTERN_TYPE_MISMATCH",
        message:
          "Literal pattern nullptr of type nullptr cannot match a value of type i32",
      },
      {
        name: "repeated-literal",
        source: matchOn("int", "1", "1 => 1, 1 => 2, _ => 0"),
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        message:
          "Unreachable match arm: 1 is already matched by an earlier arm",
      },
      {
        name: "arm-after-binding",
        source: matchOn("int", "1", "n => n, 2 => 2"),
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        message: "Unreachable match arm: an earlier arm matches every value",
      },
      {
        name: "tuple-arm-after-tuple-of-bindings",
        source: matchOn(
          "(int, int)",
          "(0, 0)",
          "(x, y) => x + y, (0, 0) => 2, _ => 0",
        ),
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        message: "Unreachable match arm: an earlier arm matches every value",
      },
      {
        name: "repeated-tuple-literal",
        source: matchOn(
          "(int, int)",
          "(0, 0)",
          "(0, 0) => 1, (0, 0) => 2, _ => 0",
        ),
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        message:
          "Unreachable match arm: this value is already matched by an earlier arm",
      },
      {
        name: "tuple-arm-covered-element-wise",
        source: matchOn(
          "(int, int)",
          "(0, 0)",
          "(0, _) => 1, (0, 5) => 2, _ => 0",
        ),
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        message:
          "Unreachable match arm: this value is already matched by an earlier arm",
      },
    ]);
  }, 60000);
});

it("matches negative literals in arms, tuples and enum payloads", () => {
  expectCorrectnessSuite([
    {
      name: "negative literal patterns",
      validateLlvm: true,
      expectedStdout: "7 1 2 4 5 3 9\n",
      source: `
      extern printf(fmt: string, ...);
      enum Opt { Some(int), None }
      frame main() ret int {
          local x: long = cast<long>(-3);
          local y: i8 = cast<i8>(-128);
          local d: double = -0.5;
          local t: (int, i8) = (0, cast<i8>(-1));
          local o: Opt = Opt.Some(-4);
          local c: char = 'A';
          local n: int = -20;
          local a: int = (match (x) { -3 => 7, -1 => 8, _ => 0 });
          local b: int = (match (y) { -128 => 1, _ => 2 });
          local e: int = (match (d) { 1 => 5, -0.5 => 2, _ => 0 });
          local g: int = (match (t) { (0, -1) => 4, _ => 0 });
          local h: int = (match (o) { Opt.Some(-4) => 5, Opt.Some(_) => 6, Opt.None => 7 });
          local k: int = (match (c) { 'A' => 3, _ => 0 });
          local m: int = (match (n) { -1 => 1, v if v < -10 => 9, _ => 0 });
          printf("%d %d %d %d %d %d %d\\n", a, b, e, g, h, k, m);
          return 0;
      }
    `,
    },
  ]);
}, 60000);
