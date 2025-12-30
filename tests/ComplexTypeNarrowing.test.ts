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

function format(source: string) {
  const program = parse(source);
  const formatter = new Formatter();
  return formatter.format(program);
}

describe("Complex Type Narrowing", () => {
  describe("Formatter", () => {
    it("should format 'as' without parentheses", () => {
      const source = "frame main() { local x: int = 10 as int; }";
      const formatted = format(source);
      expect(formatted).toContain("10 as int");
    });

    it("should format chained 'as' without parentheses", () => {
      const source =
        "frame main() { local x: bool = 42 as int as short as bool; }";
      const formatted = format(source);
      // 42 as int as short as bool
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
        import [Option] from "std/option.bpl";
        frame main() {
            local o: Option<int> = Option<int>.Some(42);
            if (o is Option<int>) {}
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });
});
