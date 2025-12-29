import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

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
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const structDecl = ast.statements.find(
      (d) => d.kind === "StructDecl" && d.name === "Point",
    );
    expect(structDecl).toBeDefined();

    // Check members
    // @ts-ignore
    const fields = structDecl.members.filter((m) => m.kind === "StructField");
    // @ts-ignore
    const methods = structDecl.members.filter((m) => m.kind === "FunctionDecl");

    expect(fields.length).toBe(2);
    expect(fields[0].name).toBe("x");
    expect(fields[1].name).toBe("y");

    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe("new");
  });

  it("should parse struct inheritance", () => {
    const source = `
      struct Animal { name: string }
      struct Dog : Animal { breed: string }
    `;
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const ast = parser.parse();

    // @ts-ignore
    const dog = ast.statements.find(
      (d) => d.kind === "StructDecl" && d.name === "Dog",
    );
    expect(dog).toBeDefined();

    // @ts-ignore
    expect(dog.inheritanceList).toBeDefined();
    // @ts-ignore
    expect(dog.inheritanceList.length).toBeGreaterThan(0);
    // @ts-ignore
    expect(dog.inheritanceList[0].name).toBe("Animal");
  });
});
