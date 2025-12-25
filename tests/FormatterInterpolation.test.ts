import { describe, expect, it } from "bun:test";
import { Formatter } from "../compiler/formatter/Formatter";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

function format(code: string): string {
  const tokens = lexWithGrammar(code, "test.bpl");
  const parser = new Parser(code, "test.bpl", tokens);
  const ast = parser.parse();
  const formatter = new Formatter();
  return formatter.format(ast).trim();
}

describe("Formatter - String Interpolation", () => {
  it("should format simple interpolated string", () => {
    const code = `local s: string = \`Hello \${name}!\`;`;
    const formatted = format(code);
    expect(formatted).toBe(`local s: string = \`Hello \${name}!\`;`);
  });

  it("should format interpolated string with expression", () => {
    const code = `local s: string = \`Sum: \${a + b}\`;`;
    const formatted = format(code);
    expect(formatted).toBe(`local s: string = \`Sum: \${a + b}\`;`);
  });

  it("should format interpolated string with multiple parts", () => {
    const code = `local s: string = \`Name: \${name}, Age: \${age}\`;`;
    const formatted = format(code);
    expect(formatted).toBe(
      `local s: string = \`Name: \${name}, Age: \${age}\`;`,
    );
  });

  it("should format interpolated string with escaped characters", () => {
    const code = `local s: string = \`Line 1\\nLine 2\`;`;
    const formatted = format(code);
    expect(formatted).toBe(`local s: string = \`Line 1\\nLine 2\`;`);
  });

  it("should format interpolated string with escaped interpolation start", () => {
    const code = "local s: string = `Use \\${variable} to interpolate`;";
    const formatted = format(code);
    expect(formatted).toBe(
      "local s: string = `Use \\${variable} to interpolate`;",
    );
  });

  it("should format interpolated string with quotes", () => {
    const code = `local s: string = \`Say \\"Hello\\"\`;`;
    const formatted = format(code);
    expect(formatted).toBe(`local s: string = \`Say \\"Hello\\"\`;`);
  });

  it("should format interpolated string with nested expressions", () => {
    const code = `local s: string = \`Result: \${foo(bar[0])}\`;`;
    const formatted = format(code);
    expect(formatted).toBe(`local s: string = \`Result: \${foo(bar[0])}\`;`);
  });
});
