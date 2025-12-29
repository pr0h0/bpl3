import { describe, expect, it } from "bun:test";
import { Formatter } from "../compiler/formatter/Formatter";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";

function format(code: string): string {
  const wrapped = `frame main() { ${code}; }`;
  const tokens = lexWithGrammar(wrapped, "test.bpl");
  const parser = new Parser(wrapped, "test.bpl", tokens);
  const program = parser.parse();
  const formatter = new Formatter();
  // We want to extract just the statement formatting
  // The formatter formats the whole program.
  const formatted = formatter.format(program);
  // Extract the line inside main
  const lines = formatted.split("\n");
  // frame main() {
  //     <code>;
  // }
  return lines[1]!.trim();
}

describe("Formatter Precedence", () => {
  it("should format '1 + 2 as long' without parens (as binds looser)", () => {
    // 1 + 2 as long -> (1 + 2) as long
    // Since + binds tighter, we don't need parens around 1+2
    expect(format("1 + 2 as long")).toBe("1 + 2 as long;");
  });

  it("should format '1 + (2 as long)' with parens", () => {
    expect(format("1 + (2 as long)")).toBe("1 + (2 as long);");
  });

  it("should format 'x < y is bool' without parens (< binds tighter)", () => {
    // x < y is bool -> (x < y) is bool
    // Since < binds tighter, we don't need parens around x < y
    expect(format("x < y is bool")).toBe("x < y is bool;");
  });

  it("should format 'x == y is bool' with parens around y is bool? No.", () => {
    // x == y is bool -> x == (y is bool)
    // == binds looser than is.
    // So we don't need parens around y is bool.
    expect(format("x == y is bool")).toBe("x == y is bool;");
  });

  it("should format '(x == y) is bool' with parens", () => {
    // (x == y) is bool
    // == binds looser than is, so we NEED parens if we want == to happen first.
    expect(format("(x == y) is bool")).toBe("(x == y) is bool;");
  });

  it("should format chained 'as' conversions", () => {
    expect(format("x as int as float")).toBe("x as int as float;");
  });

  it("should preserve parens in '(1 + 2) as long' (formatter respects user parens)", () => {
    expect(format("(1 + 2) as long")).toBe("(1 + 2) as long;");
  });

  it("should keep parens in '1 + (2 as long)'", () => {
    expect(format("1 + (2 as long)")).toBe("1 + (2 as long);");
  });

  it("should handle various numeric types in casts", () => {
    expect(format("1.5 as int")).toBe("1.5 as int;");
    expect(format("10 as float")).toBe("10 as float;");
    expect(format("c as int")).toBe("c as int;");
    expect(format("x as u8 as u16 as u32")).toBe("x as u8 as u16 as u32;");
  });
});
