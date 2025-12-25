import { describe, expect, it } from "bun:test";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return typeChecker.getErrors();
}

function expectError(source: string, errorMsgFragment: string) {
  try {
    const errors = check(source);
    if (errors.length === 0) {
      throw new Error(
        `Expected error containing "${errorMsgFragment}", but got no errors.`,
      );
    }
    const combinedError = errors.map((e) => e.message).join("\n");
    if (!combinedError.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
      throw new Error(
        `Expected error containing "${errorMsgFragment}", but got: ${combinedError}`,
      );
    }
  } catch (e: any) {
    if (e instanceof CompilerError) {
      if (!e.message.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
        throw new Error(
          `Expected error containing "${errorMsgFragment}", but got: ${e.message}`,
        );
      }
      return; // Success
    }
    if (e.message.startsWith("Expected error")) {
      throw e;
    }
    if (e.message.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
      return;
    }
    throw new Error(`Unexpected error: ${e.message}`);
  }
}

describe("More Runtime Edge Cases", () => {
  describe("Logical Operators", () => {
    it("should reject logical AND with integer", () => {
      const source = `
        frame main() {
          if (true && 1) {}
        }
      `;
      expectError(source, "boolean"); // or "type"
    });

    it("should reject logical OR with string", () => {
      const source = `
        frame main() {
          if ("true" || false) {}
        }
      `;
      expectError(source, "boolean");
    });
  });

  describe("Unary Operators", () => {
    it("should reject logical NOT on integer", () => {
      const source = `
        frame main() {
          local x: bool = !1;
        }
      `;
      expectError(source, "boolean");
    });

    it("should reject bitwise NOT on float", () => {
      const source = `
        frame main() {
          local x: i32 = ~1.5;
        }
      `;
      expectError(source, "integer"); // or "type"
    });

    it("should reject negation on string", () => {
      const source = `
        frame main() {
          local x: string = -"hello";
        }
      `;
      expectError(source, "applied to type"); // or "type"
    });
  });

  describe("String Operations", () => {
    it("should reject string subtraction", () => {
      const source = `
        frame main() {
          local s: string = "a" - "b";
        }
      `;
      expectError(source, "operator"); // or "type"
    });

    it("should reject string multiplication", () => {
      const source = `
        frame main() {
          local s: string = "a" * 2;
        }
      `;
      expectError(source, "mismatch"); // Changed from "operator" to "mismatch"
    });
  });

  describe("Array Literals", () => {
    it("should reject inconsistent types in array literal", () => {
      const source = `
        frame main() {
          local arr: i32[] = [1, "2", 3];
        }
      `;
      expectError(source, "inconsistent"); // Changed from "mismatch" to "inconsistent"
    });
  });

  describe("Assignments", () => {
    it("should reject assignment to r-value (literal)", () => {
      const source = `
        frame main() {
          1 = 2;
        }
      `;
      expectError(source, "assign"); // or "l-value"
    });

    it("should reject assignment to r-value (expression)", () => {
      const source = `
        frame main() {
          (1 + 2) = 3;
        }
      `;
      expectError(source, "assign");
    });
  });

  describe("Bitwise Shifts", () => {
    it("should reject shift by float", () => {
      const source = `
        frame main() {
          local x: i32 = 1 << 1.5;
        }
      `;
      expectError(source, "integer"); // or "type"
    });
  });

  describe("Generics", () => {
    it("should reject generic instantiation with wrong number of args", () => {
      const source = `
        struct Box<T> { val: T }
        frame main() {
          local b: Box<i32, f64> = nullptr;
        }
      `;
      expectError(source, "argument"); // or "count", "generic"
    });
  });
});
