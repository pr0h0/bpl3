import { describe, expect, it } from "bun:test";
import { Compiler } from "../compiler/index";
import { Formatter } from "../compiler/formatter/Formatter";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";

function compileToIR(code: string) {
  const compiler = new Compiler({
    filePath: "test.bpl",
    emitType: "llvm",
    useCache: false,
  });
  return compiler.compile(code);
}

function formatCode(code: string): string {
  const parser = new Parser(code, "test.bpl");
  const ast = parser.parse();
  const formatter = new Formatter();
  return formatter.format(ast);
}

describe("Sizeof Extended", () => {
  it("should parse and compile sizeof<Type>()", () => {
    const code = `
      frame main() {
        local _s: int = sizeof<int>();
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
  });

  it("should parse and compile sizeof(Type)", () => {
    const code = `
      frame main() {
        local _s: int = sizeof(int);
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
  });

  it("should parse and compile sizeof(variable)", () => {
    const code = `
      frame main() {
        local x: int = 10;
        local _s: int = sizeof(x);
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
  });

  it("should parse and compile sizeof(expression)", () => {
    const code = `
      struct Point { x: int, y: int }
      frame main() {
        local p: Point = Point { x: 1, y: 2 };
        local _s: int = sizeof(p.x);
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
  });

  it("should parse and compile sizeof(LambdaType)", () => {
    const code = `
      frame main() {
        local _s: int = sizeof(Lambda<void>());
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
  });

  it("should format sizeof<Type>() correctly", () => {
    const code = `frame main() { local x = sizeof<int>(); }`;
    const formatted = formatCode(code);
    expect(formatted).toContain("sizeof<int>()");
  });

  it("should format sizeof(Type) correctly", () => {
    const code = `frame main() { local x = sizeof(int); }`;
    const formatted = formatCode(code);
    expect(formatted).toContain("sizeof(int)");
  });

  it("should format sizeof(variable) correctly", () => {
    const code = `frame main() { local x = 1; local y = sizeof(x); }`;
    const formatted = formatCode(code);
    expect(formatted).toContain("sizeof(x)");
  });
});
