import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

describe("Lambda Frontend", () => {
  it("should lex lambda tokens correctly", () => {
    const source = "|x: int| ret int { return x; }";
    const tokens = lexWithGrammar(source, "test.bpl");
    const pipes = tokens.filter((t) => t.lexeme === "|");
    expect(pipes.length).toBeGreaterThanOrEqual(2);
  });

  it("should parse lambda expression", () => {
    const source = `
      frame main() ret int {
        local f: Lambda<int>(int) = |x: int| ret int { return x; };
        return 0;
      }
    `;
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const main = ast.statements.find(
      (d) => d.kind === "FunctionDecl" && d.name === "main",
    );
    expect(main).toBeDefined();

    // @ts-ignore
    const varDecl = main.body.statements[0];
    expect(varDecl.kind).toBe("VariableDecl");

    const lambda = varDecl.initializer;
    expect(lambda.kind).toBe("LambdaExpression");
    expect(lambda.params.length).toBe(1);
    expect(lambda.params[0].name).toBe("x");
    expect(lambda.returnType.name).toBe("int");
  });
});
