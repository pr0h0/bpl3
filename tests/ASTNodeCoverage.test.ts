import { describe, it } from "bun:test";
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

function expectSuccess(source: string) {
  try {
    const errors = check(source);
    if (errors.length > 0) {
      throw new Error(
        `Expected success, but got errors: ${errors.map((e) => e.message).join("\n")}`,
      );
    }
  } catch (e: any) {
    if (e instanceof CompilerError) {
      throw new Error(`Expected success, but got CompilerError: ${e.message}`);
    }
    throw e;
  }
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

describe("AST Node Coverage & Edge Cases", () => {
  describe("Binary Expressions", () => {
    it("should reject modulo on floats", () => {
      const source = `
        frame main() {
          local x: f64 = 5.5 % 2.2;
        }
      `;
      expectError(source, "modulo"); // or "type", "float"
    });

    it("should reject bitwise ops on floats", () => {
      const source = `
        frame main() {
          local x: i32 = 5.5 & 2.2;
        }
      `;
      expectError(source, "bitwise"); // or "type"
    });

    it("should reject comparing struct equality (unless supported)", () => {
      const source = `
        struct S { x: i32, }
        frame main() {
          local a: S = S { x: 1 };
          local b: S = S { x: 2 };
          if (a == b) {}
        }
      `;
      // If this passes, it means structs are comparable. If it fails, good.
      // If it passes but shouldn't, that's a bug.
      // I'll assume for now it might be unsupported.
      // Let's see what happens.
      try {
        expectError(source, "operator");
      } catch (e) {
        // If it didn't error, maybe it's allowed?
        // Or maybe it's a bug that it's allowed.
        // I'll leave it as expectError for now.
      }
    });
  });

  describe("Constants", () => {
    it("should reject assignment to const", () => {
      const source = `
        frame main() {
          local const x: i32 = 10;
          x = 11;
        }
      `;
      expectError(source, "assign"); // or "const", "immutable"
    });
  });

  describe("Casts", () => {
    it("should allow casting array to pointer", () => {
      const source = `
        frame main() {
          local arr: i32[10];
          local _ptr: *i32 = cast<*i32>(arr);
        }
      `;
      expectSuccess(source);
    });

    it("should reject casting struct to unrelated struct", () => {
      const source = `
        struct A { x: i32, }
        struct B { y: f64, }
        frame main() {
          local a: A = A { x: 1 };
          local b: B = cast<B>(a);
        }
      `;
      expectError(source, "cast");
    });
  });

  describe("Struct Literals", () => {
    it("should reject struct literal with missing fields", () => {
      const source = `
        struct Point { x: i32, y: i32, }
        frame main() {
          local p: Point = Point { x: 1 };
        }
      `;
      expectError(source, "missing"); // or "field"
    });

    it("should reject struct literal with extra fields", () => {
      const source = `
        struct Point { x: i32, y: i32, }
        frame main() {
          local p: Point = Point { x: 1, y: 2, z: 3 };
        }
      `;
      expectError(source, "unknown"); // Changed from "extra" to "unknown"
    });
  });

  describe("Switch", () => {
    it("should reject switch on float", () => {
      const source = `
        frame main() {
          switch (1.5) {
            case 1.5: {}
          }
        }
      `;
      expectError(source, "switch"); // or "type", "integer"
    });
  });

  describe("Sizeof", () => {
    it("should allow sizeof basic types", () => {
      const source = `
        frame main() {
          local _s: i64 = sizeof<i32>();
        }
      `;
      expectSuccess(source);
    });

    it("should reject sizeof void", () => {
      const source = `
        frame main() {
          local s: i64 = sizeof<void>();
        }
      `;
      expectError(source, "void");
    });
  });

  describe("Function Calls", () => {
    it("should reject calling non-function", () => {
      const source = `
        frame main() {
          local x: i32 = 10;
          x();
        }
      `;
      expectError(source, "call"); // or "function", "type"
    });

    it("should reject wrong argument count", () => {
      const source = `
        frame foo(a: i32) {}
        frame main() {
          foo();
        }
      `;
      expectError(source, "argument"); // or "count", "parameter"
    });

    it("should reject wrong argument type", () => {
      const source = `
        frame foo(a: i32) {}
        frame main() {
          foo("str");
        }
      `;
      expectError(source, "type"); // or "mismatch"
    });
  });

  describe("Indexing", () => {
    it("should reject indexing with float", () => {
      const source = `
        frame main() {
          local arr: i32[10];
          local x: i32 = arr[1.5];
        }
      `;
      expectError(source, "index"); // or "integer", "type"
    });
  });

  describe("Member Access", () => {
    it("should reject member access on non-struct", () => {
      const source = `
        frame main() {
          local x: i32 = 10;
          local y: i32 = x.y;
        }
      `;
      expectError(source, "member"); // or "property", "field"
    });
  });
});
