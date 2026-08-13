import { describe, expect, it } from "bun:test";
import * as AST from "../compiler/common/AST";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

function parseProgram(source: string): AST.Program {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

function findFunction(program: AST.Program, name: string): AST.FunctionDecl {
  const functionDecl = program.statements.find(
    (statement): statement is AST.FunctionDecl =>
      statement.kind === "FunctionDecl" && statement.name === name,
  );

  expect(functionDecl).toBeDefined();
  return functionDecl!;
}

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
    const ast = parseProgram(source);

    const main = findFunction(ast, "main");

    const varDecl = main.body.statements[0];
    expect(varDecl).toBeDefined();
    if (!varDecl) return;

    expect(varDecl.kind).toBe("VariableDecl");
    if (varDecl.kind !== "VariableDecl") return;

    const lambda = varDecl.initializer;
    expect(lambda?.kind).toBe("LambdaExpression");
    if (lambda?.kind !== "LambdaExpression") return;

    expect(lambda.kind).toBe("LambdaExpression");
    expect(lambda.params.length).toBe(1);
    const param = lambda.params[0];
    expect(param).toBeDefined();
    if (!param) return;

    expect(param.name).toBe("x");
    expect(lambda.returnType?.kind).toBe("BasicType");
    if (lambda.returnType?.kind !== "BasicType") return;

    expect(lambda.returnType.name).toBe("int");
  });
});
