import { describe, expect, it } from "bun:test";

import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { Formatter } from "../compiler/formatter/Formatter";
import { CompilerError } from "../compiler/common/CompilerError";
import * as AST from "../compiler/common/AST";

function parse(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  return parser.parse();
}

function check(source: string) {
  const program = parse(source);
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const errors = typeChecker.getErrors();
  if (errors.length > 0) {
    throw errors[0];
  }
  return { program, typeChecker };
}

function compile(source: string) {
  const { program } = check(source);
  const generator = new CodeGenerator();
  return generator.generate(program);
}

function format(source: string) {
  const program = parse(source);
  const formatter = new Formatter();
  return formatter.format(program);
}

describe("Type Narrowing (as/is)", () => {
  describe("Parser", () => {
    it("should parse 'as' expression", () => {
      const source =
        "frame main() { local x: int = 10; local _y: uint = x as uint; }";
      const program = parse(source);
      const func = program.statements[0] as AST.FunctionDecl;
      const block = func.body as AST.BlockStmt;
      const varDecl = block.statements[1] as AST.VariableDecl;
      const init = varDecl.initializer as AST.AsExpr;

      expect(init.kind).toBe("As");
      expect(init.expression.kind).toBe("Identifier");
      expect((init.expression as AST.IdentifierExpr).name).toBe("x");
      expect(init.type.kind).toBe("BasicType");
      expect((init.type as AST.BasicTypeNode).name).toBe("uint");
    });

    it("should parse 'is' expression", () => {
      const source = "frame main() { local x: int = 10; if (x is uint) {} }";
      const program = parse(source);
      const func = program.statements[0] as AST.FunctionDecl;
      const block = func.body as AST.BlockStmt;
      const ifStmt = block.statements[1] as AST.IfStmt;
      const condition = ifStmt.condition as AST.IsExpr;

      expect(condition.kind).toBe("Is");
      expect(condition.expression.kind).toBe("Identifier");
      expect((condition.expression as AST.IdentifierExpr).name).toBe("x");
      expect(condition.type.kind).toBe("BasicType");
      expect((condition.type as AST.BasicTypeNode).name).toBe("uint");
    });

    it("should handle precedence correctly", () => {
      // 'as' should bind tighter than comparison but looser than arithmetic?
      // Actually, usually 'as' is very high precedence or similar to other unary/postfix.
      // Let's check: x + y as T should be (x + y) as T or x + (y as T)?
      // In many languages 'as' is lower than arithmetic.
      // Based on grammar:
      // TypeCheck = Relational (("is" / "as") Type)*
      // Relational = Shift (("<" / ">" / "<=" / ">=") Shift)*
      // Shift = Additive ...
      // Additive = Multiplicative ...
      // So 'as' is LOWER precedence than arithmetic (Additive).
      // x + y as T -> (x + y) as T

      const source = "frame main() { local _x: int = 1 + 2 as int; }";
      const program = parse(source);
      const func = program.statements[0] as AST.FunctionDecl;
      const block = func.body as AST.BlockStmt;
      const varDecl = block.statements[0] as AST.VariableDecl;
      const init = varDecl.initializer as AST.AsExpr;

      expect(init.kind).toBe("As");
      expect(init.expression.kind).toBe("Binary"); // 1 + 2
    });

    it("should handle chained 'as'", () => {
      const source = "frame main() { local _x: int = 1 as int as uint; }";
      const program = parse(source);
      const func = program.statements[0] as AST.FunctionDecl;
      const block = func.body as AST.BlockStmt;
      const varDecl = block.statements[0] as AST.VariableDecl;
      const init = varDecl.initializer as AST.AsExpr; // (1 as int) as uint

      expect(init.kind).toBe("As");
      expect((init.type as AST.BasicTypeNode).name).toBe("uint");
      expect(init.expression.kind).toBe("As");
      expect(
        ((init.expression as AST.AsExpr).type as AST.BasicTypeNode).name,
      ).toBe("int");
    });
  });

  describe("TypeChecker", () => {
    it("should allow valid 'as' casts", () => {
      const source = `
        frame main() {
          local x: int = 10;
          local _y: uint = x as uint;
          local _z: float = x as float;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow valid 'is' checks", () => {
      const source = `
        frame main() {
          local x: int = 10;
          if (x is uint) {}
          if (x is int) {}
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject invalid 'as' casts", () => {
      const source = `
        frame main() {
          local x: int = 10;
          local _s: string = x as string; // Invalid
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should reject 'is' with undefined type", () => {
      const source = `
        frame main() {
          local x: int = 10;
          if (x is UnknownType) {}
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should resolve 'is' result to bool", () => {
      const source = `
            frame main() {
                local x: int = 10;
                local _b: bool = x is int;
            }
        `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("CodeGenerator", () => {
    it("should generate code for 'as' cast", () => {
      const source = `
        frame main() {
          local x: int = 10;
          local _y: float = x as float;
        }
      `;
      const ir = compile(source);
      expect(ir).toContain("sitofp i32"); // Signed int to float
    });

    it("should generate code for 'is' check", () => {
      const source = `
        frame main() {
          local x: int = 10;
          if (x is int) {}
        }
      `;
      const ir = compile(source);
      // Since x is int, x is int should be true (1)
      // The optimizer might fold it, but let's check for comparison or result
      // In generateRegularTypeMatch, if types are semantically equal, it returns true (1)
      expect(ir).toContain("icmp eq i1 1, 1");
    });

    it("should generate code for 'is' check with different types", () => {
      const source = `
          frame main() {
            local x: int = 10;
            if (x is uint) {}
          }
        `;
      const ir = compile(source);
      // int vs uint -> should be false
      expect(ir).toContain("icmp eq i1 0, 1");
    });
  });

  describe("Complex Scenarios", () => {
    describe("Formatter", () => {
      it("should format 'as' without parentheses", () => {
        const source = "frame main() { local _x: int = 10 as int; }";
        const formatted = format(source);
        expect(formatted).toContain("10 as int");
      });

      it("should format chained 'as' without parentheses", () => {
        const source =
          "frame main() { local _x: bool = 42 as int as short as bool; }";
        const formatted = format(source);
        expect(formatted).toContain("42 as int as short as bool");
      });
    });

    describe("Structs and Inheritance", () => {
      it("should allow casting struct to parent", () => {
        const source = `
          struct Animal {
              name: string,
          }
          struct Dog : Animal {
              breed: string,
              frame new(n: string, b: string) ret Dog {
                  local d: Dog;
                  d.name = n;
                  d.breed = b;
                  return d;
              }
          }
          frame main() {
              local d: Dog = Dog.new("Buddy", "Golden");
              local _a: Animal = d as Animal;
          }
        `;
        expect(() => check(source)).not.toThrow();
      });

      it("should check 'is' with inheritance", () => {
        const source = `
          struct Animal { name: string }
          struct Dog : Animal { breed: string }
          frame main() {
              local d: Dog;
              if (d is Animal) {}
          }
        `;
        expect(() => check(source)).not.toThrow();
      });
    });

    describe("Specs", () => {
      it("should check 'is' with specs", () => {
        const source = `
          spec Printable {
              frame print();
          }
          struct MyStruct : Printable {
              frame print() {}
          }
          frame main() {
              local s: MyStruct;
              if (s is Printable) {}
          }
        `;
        expect(() => check(source)).not.toThrow();
      });
    });

    describe("Enums", () => {
      it("should check 'is' with enums", () => {
        const source = `
          enum Option<T> { Some(T), None }
          frame main() {
              local o: Option<int> = Option<int>.Some(42);
              if (o is Option<int>) {}
          }
        `;
        expect(() => check(source)).not.toThrow();
      });
    });
  });
});
