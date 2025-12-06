import { describe, expect, it } from "bun:test";

import { CompilerError } from "../errors";
import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "../transpiler/HelperGenerator";
import Scope from "../transpiler/Scope";

function analyze(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const analyzer = new SemanticAnalyzer();
  const scope = new Scope();

  if (!scope.resolveType("u8")) {
    HelperGenerator.generateBaseTypes(scope);
  }

  analyzer.analyze(program, scope);
}

describe("SemanticAnalyzer", () => {
  describe("Variable Declarations", () => {
    it("should detect duplicate variable definition", () => {
      const input = `
                global x: u64 = 10;
                global x: u64 = 20;
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("already defined");
    });

    it("should detect type mismatch in initialization", () => {
      const input = `
                global x: u8 = "string";
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("Type mismatch");
    });

    it("should detect uninitialized const", () => {
      const input = `
                global const x: u64;
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      // Parser throws this
      expect(() => analyze(input)).toThrow(
        /Constant variable.*must be initialized/,
      );
    });
  });

  describe("Function Declarations", () => {
    it("should detect duplicate function definition", () => {
      const input = `
                frame foo() {}
                frame foo() {}
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("already defined");
    });

    it("should detect return type mismatch", () => {
      const input = `
                frame foo() ret u8 {
                    return "string";
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("Type mismatch");
    });

    it("should detect void function returning value", () => {
      const input = `
                frame foo() {
                    return 10;
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow(
        "Void function cannot return a value",
      );
    });

    it("should detect non-void function returning void", () => {
      const input = `
                frame foo() ret u64 {
                    return;
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("Function expects return type");
    });
  });

  describe("Function Calls", () => {
    it("should detect undefined function call", () => {
      const input = `
                frame main() {
                    call undefined_func();
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("Undefined function");
    });

    it("should detect argument count mismatch", () => {
      const input = `
                frame foo(a: u64) {}
                frame main() {
                    call foo();
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("expects 1 arguments");
    });

    it("should detect argument type mismatch", () => {
      const input = `
                frame foo(a: u8) {}
                frame main() {
                    call foo("string");
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("Type mismatch");
    });
  });

  describe("Binary Expressions", () => {
    it("should detect type mismatch in binary operation", () => {
      const input = `
                frame main() {
                    local x: f64 = 10.5 + "string";
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("Type mismatch");
    });
  });

  describe("Variadic Functions", () => {
    it("should allow variadic function call with correct types", () => {
      const input = `
                frame sum(count: u64, ...:u64) {}
                frame main() {
                    call sum(2, 10, 20);
                }
            `;
      expect(() => analyze(input)).not.toThrow();
    });

    it("should detect type mismatch in variadic arguments", () => {
      const input = `
                frame sum(count: u64, ...:u8) {}
                frame main() {
                    call sum(2, 10, "string");
                }
            `;
      expect(() => analyze(input)).toThrow(CompilerError);
      expect(() => analyze(input)).toThrow("Type mismatch");
    });
  });
});
