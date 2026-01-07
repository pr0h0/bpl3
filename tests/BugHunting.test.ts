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
    // If it's the error we threw above, rethrow it
    if (e.message.startsWith("Expected error")) {
      throw e;
    }
    // If check() threw a CompilerError directly (some do)
    if (e.message.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
      return;
    }
    throw new Error(`Unexpected error: ${e.message}`);
  }
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
    throw new Error(`Expected success, but got exception: ${e.message}`);
  }
}

describe("Bug Hunting - Edge Cases", () => {
  describe("1. Primitive Types & Limits", () => {
    it("should reject integer overflow for i8", () => {
      const source = `
        frame main() {
          local x: i8 = 128;
        }
      `;
      expectError(source, "overflow");
    });

    it("should reject integer overflow for i32", () => {
      const source = `
          frame main() {
            local x: i32 = 2147483648;
          }
        `;
      expectError(source, "overflow");
    });

    it("should reject division by zero in constant folding", () => {
      const source = `
          frame main() {
            local x: i32 = 1 / 0;
          }
        `;
      expectError(source, "Division by zero");
    });
  });

  describe("2. Control Flow Edge Cases", () => {
    it("should reject if statement with non-boolean condition (int)", () => {
      const source = `
            frame main() {
                if (1) {}
            }
          `;
      expectError(source, "boolean");
    });

    it("should reject if statement with non-boolean condition (string)", () => {
      const source = `
          frame main() {
              if ("true") {}
          }
        `;
      expectError(source, "boolean");
    });

    it("should reject break outside loop", () => {
      const source = `
            frame main() {
                break;
            }
        `;
      expectError(source, "break");
    });

    it("should reject continue outside loop", () => {
      const source = `
            frame main() {
                continue;
            }
        `;
      expectError(source, "continue");
    });
  });

  describe("3. Structs & Recursion", () => {
    it("should reject self-referential struct without pointer", () => {
      const source = `
            struct Node {
                next: Node,
            }
          `;
      expectError(source, "recursive");
    });

    it("should accept self-referential struct with pointer", () => {
      const source = `
          struct Node {
              next: *Node,
          }
        `;
      expectSuccess(source);
    });
  });

  describe("4. Functions", () => {
    it("should reject function with duplicate parameter names", () => {
      const source = `
            frame test(a: i32, a: i32) {}
          `;
      expectError(source, "duplicate");
    });

    it("should reject void function returning value", () => {
      const source = `
            frame test() ret void {
                return 1;
            }
          `;
      expectError(source, "return");
    });

    it("should reject non-void function missing return", () => {
      const source = `
            frame test() ret i32 {
                local x: i32 = 1;
            }
          `;
      expectError(source, "return");
    });
  });

  describe("5. Enums & Matching", () => {
    it("should reject empty match on enum", () => {
      const source = `
            enum Color { Red, Blue }
            frame main() {
                local c: Color = Color.Red;
                match (c) {};
            }
          `;
      expectError(source, "exhaustive");
    });

    it("should accept match on primitive type", () => {
      // Updated: We now support primitive pattern matching
      const source = `
            frame main() {
                local x: i32 = 1;
                match (x) {
                    1 => {},
                    _ => {}
                };
            }
          `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject non-exhaustive match", () => {
      const source = `
            enum Color { Red, Blue }
            frame main() {
                local c: Color = Color.Red;
                match (c) {
                    Color.Red => {}
                };
            }
          `;
      expectError(source, "exhaustive");
    });
  });

  describe("6. Arrays", () => {
    it("should reject array size 0", () => {
      const source = `
            frame main() {
                local arr: i32[0];
            }
          `;
      expectError(source, "size");
    });

    it("should reject negative array size", () => {
      const source = `
          frame main() {
              local arr: i32[-1];
          }
        `;
      expectError(source, "size");
    });
  });

  describe("7. Switch Statements", () => {
    it("should reject duplicate cases in switch", () => {
      const source = `
            frame main() {
                switch (1) {
                    case 1: {}
                    case 1: {}
                }
            }
          `;
      expectError(source, "duplicate");
    });
  });

  describe("8. Variable Shadowing", () => {
    it("should reject shadowing in same scope", () => {
      const source = `
            frame main() {
                local x: i32 = 1;
                local x: i32 = 2;
            }
          `;
      expectError(source, "declared");
    });
  });

  describe("9. Unreachable Code & Unused Variables", () => {
    it("should warn or error on unreachable code after return", () => {
      const source = `
            frame main() {
                return;
                local x: i32 = 1;
            }
          `;
      expectError(source, "unreachable");
    });

    it("should warn or error on unused variable", () => {
      const source = `
            frame main() {
                local name: i32 = 1;
            }
          `;
      expectError(source, "unused");
    });
  });

  describe("10. Type Casting", () => {
    it("should reject invalid cast from int to string", () => {
      const source = `
            frame main() {
                local x: i32 = 1;
                local s: string = cast<string>(x);
            }
          `;
      expectError(source, "cast");
    });

    it("should reject invalid cast from struct to int", () => {
      const source = `
            struct Point { x: i32, y: i32 }
            frame main() {
                local p: Point = Point { x: 1, y: 2 };
                local i: i32 = cast<i32>(p);
            }
          `;
      expectError(source, "cast");
    });
  });

  describe("6. Array Edge Cases", () => {
    it("should reject zero-sized arrays", () => {
      const source = `
          frame main() {
            local arr: int[0];
          }
        `;
      expectError(source, "Array size must be greater than zero");
    });
  });
});
