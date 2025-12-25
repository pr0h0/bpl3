import { describe, expect, it } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";

function parse(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

describe("String Escaping", () => {
  it("should handle escaped interpolation start in interpolated string", () => {
    const source = `
      frame main() {
        local s: string = \`Escaped: \\\${not_interpolated}\`;
  }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(1);
    expect(init.parts[0].kind).toBe("Literal");
    expect(init.parts[0].value).toBe("Escaped: ${not_interpolated}");
  });

  it("should handle literal ${ in normal string", () => {
    const source = `
      frame main() {
        local s: string = "Literal: \${not_interpolated}";
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("Literal");
    expect(init.value).toBe("Literal: ${not_interpolated}");
  });
});
