import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

describe("Generics Frontend", () => {
  it("should parse generic struct", () => {
    const source = `
      struct Box<T> {
        value: T,
        frame get(this: Box<T>) ret T { return this.value; }
      }
    `;
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const box = ast.statements.find(
      (d) => d.kind === "StructDecl" && d.name === "Box",
    );
    expect(box).toBeDefined();
    // @ts-ignore
    expect(box.genericParams.length).toBe(1);
    // @ts-ignore
    expect(box.genericParams[0].name).toBe("T");
  });

  it("should parse generic function", () => {
    const source = `
      frame identity<T>(x: T) ret T {
        return x;
      }
    `;
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const func = ast.statements.find(
      (d) => d.kind === "FunctionDecl" && d.name === "identity",
    );
    expect(func).toBeDefined();
    // @ts-ignore
    expect(func.genericParams.length).toBe(1);
    // @ts-ignore
    expect(func.genericParams[0].name).toBe("T");
  });

  it("should parse generic spec", () => {
    const source = `
      spec Container<T> {
        frame get(this: Container<T>) ret T;
      }
    `;
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const spec = ast.statements.find(
      (d) => d.kind === "SpecDecl" && d.name === "Container",
    );
    expect(spec).toBeDefined();
    // @ts-ignore
    expect(spec.genericParams.length).toBe(1);
    // @ts-ignore
    expect(spec.genericParams[0].name).toBe("T");
  });

  it("should parse lambda in generic function", () => {
    const source = `
      frame map<T>(item: T) ret T {
        local f: Func<T>(T) = |x: T| ret T { return x; };
        return f(item);
      }
    `;
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const func = ast.statements.find(
      (d) => d.kind === "FunctionDecl" && d.name === "map",
    );
    expect(func).toBeDefined();
    // @ts-ignore
    const lambdaVar = func.body.statements.find(
      (s: any) => s.kind === "VariableDecl",
    );
    expect(lambdaVar).toBeDefined();
  });

  it("should parse generic inheritance", () => {
    const source = `
      struct Parent<T> { val: T }
      struct Child<T> : Parent<T> { extra: int }
    `;
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const child = ast.statements.find(
      (d) => d.kind === "StructDecl" && d.name === "Child",
    );
    expect(child).toBeDefined();
    // @ts-ignore
    expect(child.inheritanceList[0].kind).toBe("BasicType");
    // @ts-ignore
    expect(child.inheritanceList[0].name).toBe("Parent");
    // @ts-ignore
    expect(child.inheritanceList[0].genericArgs.length).toBe(1);
  });
});
