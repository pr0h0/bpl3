import { describe, it, expect } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { CompilerError } from "../compiler/common/CompilerError";

describe("Parser - Extended Tests", () => {
  describe("Expressions", () => {
    it("should parse binary expressions with correct precedence", () => {
      const source = "frame test() { local x: int = 2 + 3 * 4; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      // 3 * 4 should be evaluated before + 2
      expect(program.statements.length).toBe(1);
    });

    it("should parse unary expressions", () => {
      const source =
        "frame test() { local x: int = -5; local y: bool = !true; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse ternary operator", () => {
      const source = "frame test() { local x: int = true ? 1 : 0; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse nested ternary operators", () => {
      const source = "frame test() { local x: int = a ? b ? 1 : 2 : 3; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse cast expressions", () => {
      const source = "frame test() { local x: float = cast<float>(10); }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse sizeof expressions", () => {
      const source =
        "frame test() { local x: int = sizeof(int); local y: int = sizeof(arr); }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse array subscript", () => {
      const source =
        "frame test() { local x: int = arr[0]; local y: int = matrix[1][2]; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse member access", () => {
      const source =
        "frame test() { local x: int = obj.field; local y: int = obj.method(); }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse member access", () => {
      const source = "frame test(p: Point) ret int { return p.x; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse compound assignment operators", () => {
      const source =
        "frame test() { local x: int = 0; local y: int = 0; local z: int = 0; x += 1; y -= 2; z *= 3; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse function calls with multiple arguments", () => {
      const source = "frame test() { func(1, 2, 3, 4, 5); }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse generic function calls", () => {
      const source = "frame test() { identity<int>(42); swap<float>(a, b); }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });
  });

  describe("Statements", () => {
    it("should parse if statements", () => {
      const source = "frame test() { if (x > 0) { y = 1; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse if-else statements", () => {
      const source = "frame test() { if (x > 0) { y = 1; } else { y = -1; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse if-else-if chains", () => {
      const source =
        "frame test() { if (x > 0) { y = 1; } else if (x < 0) { y = -1; } else { y = 0; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse loop statements", () => {
      const source = "frame test() { loop { break; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse loop with condition", () => {
      const source = "frame test() { loop (x < 10) { x = x + 1; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse for-style loops", () => {
      const source =
        "frame test() { local i: int = 0; loop { if (i >= 10) { break; } i += 1; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse switch statements", () => {
      const source =
        "frame test() { local x: int = 1; local y: int = 0; switch (x) { case 1: { y = 1; break; } case 2: { y = 2; break; } default: { y = 0; break; } } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse return statements", () => {
      const source = "frame test() ret int { return 42; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse break and continue", () => {
      const source =
        "frame test() { loop { if (x) {break;} if (y) {continue;} } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });
  });

  describe("Type Declarations", () => {
    it("should parse basic type aliases", () => {
      const source = "type MyInt = int;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
      const typeAlias = program.statements[0]!;
      expect(typeAlias.kind).toBe("TypeAlias");
    });

    it("should parse struct type aliases", () => {
      const source = "type MyPoint = Point; struct Point { x: int, y: int, }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl");
      const program = parser.parse();
      expect(program.statements.length).toBe(2);
    });

    it("should parse nested type aliases", () => {
      const source = "type ID = int; type UserID = ID;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl");
      const program = parser.parse();
      expect(program.statements.length).toBe(2);
    });

    it("should parse struct with inheritance", () => {
      const source = "struct Child : Parent { x: int, }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
      const structDecl = program.statements[0]!;
      if (structDecl.kind === "StructDecl") {
        expect(structDecl.parentType).toBeDefined();
      }
    });

    it("should parse nested structs", () => {
      const source = "struct Outer { x: int, } struct Inner { y: int, }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(2);
    });

    it("should parse generic structs", () => {
      const source = "struct Box<T> { value: T, }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
      const structDecl = program.statements[0]!;
      if (structDecl.kind === "StructDecl") {
        expect(structDecl.genericParams.length).toBe(1);
      }
    });

    it("should parse generic structs with multiple type parameters", () => {
      const source = "struct Pair<K, V> { key: K, value: V, }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
      const structDecl = program.statements[0]!;
      if (structDecl.kind === "StructDecl") {
        expect(structDecl.genericParams.length).toBe(2);
      }
    });
  });

  describe("Function Declarations", () => {
    it("should parse generic functions", () => {
      const source = "frame identity<T>(val: T) ret T { return val; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
      const funcDecl = program.statements[0]!;
      if (funcDecl.kind === "FunctionDecl") {
        expect(funcDecl.genericParams.length).toBe(1);
      }
    });

    it("should parse variadic functions", () => {
      const source = "extern printf(fmt: string, ...) ret int;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse function with no return type (void)", () => {
      const source = "frame test() { }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse function overloads", () => {
      const source =
        "frame add(a: int, b: int) ret int { return a + b; } frame add(a: float, b: float) ret float { return a + b; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(2);
    });

    it("should parse struct methods", () => {
      const source =
        "struct Point { x: int, y: int, frame sum(this: Point) ret int { return this.x + this.y; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse static methods", () => {
      const source =
        "struct Math { frame abs(x: int) ret int { return x < 0 ? -x : x; } }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });
  });

  describe("Import/Export", () => {
    it("should parse import statements", () => {
      const source = 'import [Vec], [Map] from "std/collections.bpl";';
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
      const importStmt = program.statements[0]!;
      expect(importStmt.kind).toBe("Import");
    });

    it("should parse export statements", () => {
      const source =
        "frame add(a: int, b: int) ret int { return a + b; } export add;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(2);
    });

    it("should parse multiple imports from same module", () => {
      const source =
        'import [String], [Vec], [Map], [Set] from "std/collections.bpl";';
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });
  });

  describe("Array and Pointer Types", () => {
    it("should parse array types", () => {
      const source = "local arr: int[10];";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse multi-dimensional arrays", () => {
      const source = "local matrix: int[3][3];";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse pointer types", () => {
      const source = "local ptr: *int;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse double pointers", () => {
      const source = "local pp: **int;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse array of pointers", () => {
      const source = "local ptrs: *int[10];";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });
  });

  describe("Literals", () => {
    it("should parse integer literals", () => {
      const source =
        "frame test() { local a: int = 42; local b: int = 0x2A; local c: int = 0b101010; local d: int = 052; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse float literals", () => {
      const source =
        "frame test() { local a: float = 3.14; local b: float = 100.0; local c: float = 0.0025; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse string literals", () => {
      const source = 'frame test() { local s: string = "Hello, World!"; }';
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse character literals", () => {
      const source =
        "frame test() ret void { local c: char = 'a'; local newline: char = '\\n'; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse boolean literals", () => {
      const source =
        "frame test() { local t: bool = true; local f: bool = false; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse null literal", () => {
      const source = "frame test() { local p: *int = null; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });

    it("should parse array literals", () => {
      const source = "frame test() { local arr: int[5] = [1, 2, 3, 4, 5]; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      const program = parser.parse();
      expect(program.statements.length).toBe(1);
    });
  });

  describe("Error Recovery", () => {
    it("should throw on missing semicolon", () => {
      const source = "local x: int = 10 local y: int = 20;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      expect(() => parser.parse()).toThrow();
    });

    it("should throw on mismatched braces", () => {
      const source = "frame test() { if (x) { y = 1; }";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      expect(() => parser.parse()).toThrow();
    });

    it("should throw on invalid type syntax", () => {
      const source = "local x: int[;";
      const tokens = lexWithGrammar(source, "test.bpl");
      const parser = new Parser(source, "test.bpl", tokens);
      expect(() => parser.parse()).toThrow();
    });
  });
});
