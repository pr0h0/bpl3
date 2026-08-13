import { describe, expect, it } from "bun:test";
import * as AST from "../compiler/common/AST";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

function parseProgram(source: string): AST.Program {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

function findStruct(program: AST.Program, name: string): AST.StructDecl {
  const structDecl = program.statements.find(
    (statement): statement is AST.StructDecl =>
      statement.kind === "StructDecl" && statement.name === name,
  );

  expect(structDecl).toBeDefined();
  return structDecl!;
}

describe("Struct Frontend", () => {
  it("should lex struct tokens correctly", () => {
    const source = "struct Point { x: int, y: int }";
    const tokens = lexWithGrammar(source, "test.bpl");

    const structKw = tokens.find((t) => t.lexeme === "struct");
    expect(structKw).toBeDefined();

    const identifiers = tokens.filter((t) => t.type === "Identifier");
    expect(identifiers.length).toBeGreaterThanOrEqual(3); // Point, x, int, y, int
  });

  it("should parse struct declaration", () => {
    const source = `
      struct Point {
        x: int,
        y: int,
        
        frame new(x: int, y: int) ret Point {
            local p: Point;
            p.x = x;
            p.y = y;
            return p;
        }
      }
    `;
    const ast = parseProgram(source);

    const structDecl = findStruct(ast, "Point");

    // Check members
    const fields = structDecl.members.filter(
      (member): member is AST.StructField => member.kind === "StructField",
    );
    const methods = structDecl.members.filter(
      (member): member is AST.FunctionDecl => member.kind === "FunctionDecl",
    );

    expect(fields.length).toBe(2);
    const firstField = fields[0];
    const secondField = fields[1];
    expect(firstField).toBeDefined();
    expect(secondField).toBeDefined();
    if (!firstField || !secondField) return;

    expect(firstField.name).toBe("x");
    expect(secondField.name).toBe("y");

    expect(methods.length).toBe(1);
    const method = methods[0];
    expect(method).toBeDefined();
    if (!method) return;

    expect(method.name).toBe("new");
  });

  it("should parse struct inheritance", () => {
    const source = `
      struct Animal { name: string }
      struct Dog : Animal { breed: string }
    `;
    const ast = parseProgram(source);

    const dog = findStruct(ast, "Dog");

    expect(dog.inheritanceList).toBeDefined();
    expect(dog.inheritanceList.length).toBeGreaterThan(0);
    const parentType = dog.inheritanceList[0];
    expect(parentType).toBeDefined();
    if (!parentType) return;

    expect(parentType.kind).toBe("BasicType");
    if (parentType.kind !== "BasicType") return;

    expect(parentType.name).toBe("Animal");
  });
});
