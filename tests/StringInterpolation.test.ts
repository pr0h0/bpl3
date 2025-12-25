import { describe, expect, it } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";

function parse(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

describe("String Interpolation", () => {
  it("should parse basic string interpolation", () => {
    const source = `
      frame main() {
        local s: string = \`Hello \${name}!\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const varDecl = func.body.statements[0];
    const init = varDecl.initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(3); // "Hello ", name, "!"

    expect(init.parts[0].kind).toBe("Literal");
    expect(init.parts[0].value).toBe("Hello ");

    expect(init.parts[1].kind).toBe("Identifier");
    expect(init.parts[1].name).toBe("name");

    expect(init.parts[2].kind).toBe("Literal");
    expect(init.parts[2].value).toBe("!");
  });

  it("should parse expression interpolation", () => {
    const source = `
      frame main() {
        local s: string = \`Sum: \${a + b}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(2); // "Sum: ", a + b

    expect(init.parts[0].kind).toBe("Literal");
    expect(init.parts[0].value).toBe("Sum: ");

    expect(init.parts[1].kind).toBe("Binary");
    expect(init.parts[1].operator.lexeme).toBe("+");
  });

  it("should parse nested interpolation", () => {
    const source = `
      frame main() {
        local s: string = \`Result: \${(x > 0) ? "Pos" : "Neg"}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(2);

    expect(init.parts[1].kind).toBe("Ternary");
  });

  it("should handle empty interpolation", () => {
    const source = `
      frame main() {
        local s: string = \`\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(0);
  });

  it("should handle only expression", () => {
    const source = `
      frame main() {
        local s: string = \`\${x}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(1);
    expect(init.parts[0].kind).toBe("Identifier");
  });
});
