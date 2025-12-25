import { describe, expect, it } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";

function parse(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

describe("String Interpolation Advanced", () => {
  it("should parse complex expressions inside interpolation", () => {
    const source = `
      frame main() {
        local s: string = \`Result: \${foo(a, b) + bar.baz[0]}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(2);
    expect(init.parts[1].kind).toBe("Binary");
  });

  it("should parse nested interpolated strings", () => {
    const source = `
      frame main() {
        local s: string = \`Outer \${\`Inner \${val}\`} Outer\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts.length).toBe(3); // "Outer ", inner expr, " Outer"

    const innerExpr = init.parts[1];
    expect(innerExpr.kind).toBe("InterpolatedString");
    expect(innerExpr.parts.length).toBe(2); // "Inner ", val
  });

  it("should parse deeply nested interpolated strings (10 levels)", () => {
    // Construct 10 levels deep interpolation
    // Level 0: $"L0 ${ ... } L0"
    // Level 1: $"L1 ${ ... } L1"
    // ...
    // Level 9: $"L9 ${ val } L9"

    let code = "val";
    for (let i = 9; i >= 0; i--) {
      code = `\`L${i} \${${code}} L${i}\``;
    }

    const source = `
      frame main() {
        local s: string = ${code};
      }
    `;

    const ast = parse(source);
    const func = ast.statements[0] as any;
    let expr = func.body.statements[0].initializer;

    for (let i = 0; i < 10; i++) {
      expect(expr.kind).toBe("InterpolatedString");
      expect(expr.parts.length).toBe(3);
      expect(expr.parts[0].value).toBe(`L${i} `);
      expect(expr.parts[2].value).toBe(` L${i}`);
      expr = expr.parts[1];
    }

    expect(expr.kind).toBe("Identifier");
    expect(expr.name).toBe("val");
  });

  it("should parse interpolation with struct literal", () => {
    const source = `
      frame main() {
        local s: string = \`Point: \${Point { x: 1, y: 2 }}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("StructLiteral");
  });

  it("should parse interpolation with match expression", () => {
    const source = `
      frame main() {
        local s: string = \`Value is \${match(opt) { Option.Some(x) => x, Option.None => 0 }}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("Match");
  });

  it("should parse interpolation with array literal", () => {
    const source = `
      frame main() {
        local s: string = \`Array: \${[1, 2, 3]}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("ArrayLiteral");
  });

  it("should parse interpolation with pointer operations", () => {
    const source = `
      frame main() {
        local s: string = \`Pointer: \${&x} Deref: \${*ptr}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    // "Pointer: ", &x, " Deref: ", *ptr
    expect(init.parts[1].kind).toBe("Unary");
    expect(init.parts[1].operator.lexeme).toBe("&");
    expect(init.parts[3].kind).toBe("Unary");
    expect(init.parts[3].operator.lexeme).toBe("*");
  });

  it("should parse interpolation with enum variant", () => {
    const source = `
      frame main() {
        local s: string = \`Status: \${Status.Active}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("Member");
  });

  it("should parse interpolation with ternary operator", () => {
    const source = `
      frame main() {
        local s: string = \`Result: \${cond ? "True" : "False"}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("Ternary");
  });

  it("should parse interpolation with function call", () => {
    const source = `
      frame main() {
        local s: string = \`Value: \${get_value()}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("Call");
  });

  it("should parse interpolation with arithmetic addition", () => {
    const source = `
      frame main() {
        local s: string = \`Sum: \${1 + 2}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("Binary");
    expect(init.parts[1].operator.lexeme).toBe("+");
  });

  it("should parse interpolation with struct addition (operator overloading)", () => {
    const source = `
      frame main() {
        local s: string = \`Vector Sum: \${vec1 + vec2}\`;
      }
    `;
    const ast = parse(source);
    const func = ast.statements[0] as any;
    const init = func.body.statements[0].initializer;

    expect(init.kind).toBe("InterpolatedString");
    expect(init.parts[1].kind).toBe("Binary");
    expect(init.parts[1].operator.lexeme).toBe("+");
  });

  it("should fail on unterminated interpolation", () => {
    const source = `
      frame main() {
        local s: string = \`Hello \${name\`;
  }
    `;
    expect(() => parse(source)).toThrow();
  });

  it("should fail on unclosed string", () => {
    const source = `
      frame main() {
    local s: string = \`Hello \${name}
      }
    `;
    expect(() => parse(source)).toThrow();
  });
});
