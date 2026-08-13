import { describe, expect, it } from "bun:test";
import * as AST from "../compiler/common/AST";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

function parseProgram(source: string): AST.Program {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

function findNamedStatement<TKind extends AST.Statement["kind"]>(
  program: AST.Program,
  kind: TKind,
  name: string,
): Extract<AST.Statement, { kind: TKind }> {
  const statement = program.statements.find(
    (candidate): candidate is Extract<AST.Statement, { kind: TKind }> =>
      candidate.kind === kind && "name" in candidate && candidate.name === name,
  );

  expect(statement).toBeDefined();
  return statement!;
}

describe("Generics Frontend", () => {
  it("should parse generic struct", () => {
    const source = `
      struct Box<T> {
        value: T,
        frame get(this: Box<T>) ret T { return this.value; }
      }
    `;
    const ast = parseProgram(source);

    const box = findNamedStatement(ast, "StructDecl", "Box");
    expect(box.genericParams.length).toBe(1);
    const genericParam = box.genericParams[0];
    expect(genericParam).toBeDefined();
    if (!genericParam) return;

    expect(genericParam.name).toBe("T");
  });

  it("should parse generic function", () => {
    const source = `
      frame identity<T>(x: T) ret T {
        return x;
      }
    `;
    const ast = parseProgram(source);

    const func = findNamedStatement(ast, "FunctionDecl", "identity");
    expect(func.genericParams.length).toBe(1);
    const genericParam = func.genericParams[0];
    expect(genericParam).toBeDefined();
    if (!genericParam) return;

    expect(genericParam.name).toBe("T");
  });

  it("should parse generic spec", () => {
    const source = `
      spec Container<T> {
        frame get(this: Container<T>) ret T;
      }
    `;
    const ast = parseProgram(source);

    const spec = findNamedStatement(ast, "SpecDecl", "Container");
    expect(spec.genericParams.length).toBe(1);
    const genericParam = spec.genericParams[0];
    expect(genericParam).toBeDefined();
    if (!genericParam) return;

    expect(genericParam.name).toBe("T");
  });

  it("should parse lambda in generic function", () => {
    const source = `
      frame map<T>(item: T) ret T {
        local f: Func<T>(T) = |x: T| ret T { return x; };
        return f(item);
      }
    `;
    const ast = parseProgram(source);

    const func = findNamedStatement(ast, "FunctionDecl", "map");
    const lambdaVar = func.body.statements.find(
      (statement): statement is AST.VariableDecl =>
        statement.kind === "VariableDecl",
    );
    expect(lambdaVar).toBeDefined();
  });

  it("should parse generic inheritance", () => {
    const source = `
      struct Parent<T> { val: T }
      struct Child<T> : Parent<T> { extra: int }
    `;
    const ast = parseProgram(source);

    const child = findNamedStatement(ast, "StructDecl", "Child");
    const parentType = child.inheritanceList[0];
    expect(parentType).toBeDefined();
    if (!parentType) return;

    expect(parentType.kind).toBe("BasicType");
    if (parentType.kind !== "BasicType") return;

    expect(parentType.name).toBe("Parent");
    expect(parentType.genericArgs.length).toBe(1);
  });
});
