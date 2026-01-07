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
  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    throw typeErrors[0];
  }
  return program;
}

describe("Primitive Pattern Matching", () => {
  describe("Integer Pattern Matching", () => {
    it("should match int literals", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            0 => 1,
            5 => 2,
            10 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match i8 literals", () => {
      const source = `
        frame test(x: i8) ret int {
          return match (x) {
            0 => 1,
            127 => 2,
            50 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match i16 literals", () => {
      const source = `
        frame test(x: i16) ret int {
          return match (x) {
            0 => 1,
            1000 => 2,
            2000 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match i32 literals", () => {
      const source = `
        frame test(x: i32) ret int {
          return match (x) {
            0 => 1,
            42 => 2,
            100 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match i64 literals", () => {
      const source = `
        frame test(x: i64) ret int {
          return match (x) {
            0 => 1,
            1000000 => 2,
            2000000 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match u8 literals", () => {
      const source = `
        frame test(x: u8) ret int {
          return match (x) {
            0 => 1,
            255 => 2,
            128 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match u32 literals", () => {
      const source = `
        frame test(x: u32) ret int {
          return match (x) {
            0 => 1,
            42 => 2,
            1000 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match identifier with guard", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            n if n > 10 => 1,
            n if n < 0 => 2,
            n if n == 5 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match with complex guards", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            n if n % 2 == 0 && n > 0 => 1,
            n if n % 3 == 0 || n < -10 => 2,
            n if n >= 100 && n <= 200 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow identifier without guard", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            0 => 1,
            n => n + 1
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match with wildcard", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            0 => 1,
            5 => 2,
            _ => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Float Pattern Matching", () => {
    it("should match float literals", () => {
      const source = `
        frame test(x: float) ret int {
          return match (x) {
            0.0 => 1,
            1.5 => 2,
            3.14 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match f32 literals", () => {
      const source = `
        frame test(x: f32) ret int {
          return match (x) {
            0.0 => 1,
            1.0 => 2,
            _ => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match f64 literals", () => {
      const source = `
        frame test(x: f64) ret int {
          return match (x) {
            0.0 => 1,
            1.0 => 2,
            _ => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match float with guard", () => {
      const source = `
        frame test(x: float) ret int {
          return match (x) {
            f if f > 0.0 => 1,
            f if f < 0.0 => 2,
            _ => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Boolean Pattern Matching", () => {
    it("should match bool literals", () => {
      const source = `
        frame test(x: bool) ret int {
          return match (x) {
            true => 1,
            false => 0
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match bool with identifier", () => {
      const source = `
        frame test(x: bool) ret int {
          return match (x) {
            true => 1,
            b => 0
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("String Pattern Matching", () => {
    it("should match string literals", () => {
      const source = `
        extern strlen(s: string) ret int;
        frame test(x: string) ret int {
          return match (x) {
            "" => 1,
            "hello" => 2,
            "world" => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match string with guard", () => {
      const source = `
        extern strlen(s: string) ret int;
        frame test(x: string) ret int {
          return match (x) {
            "" => 1,
            s if strlen(s) > 10 => 2,
            s if strlen(s) < 3 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match special characters in strings", () => {
      const source = `
        extern strlen(s: string) ret int;
        frame test(x: string) ret int {
          return match (x) {
            "\\n" => 1,
            "\\t" => 2,
            "\\"" => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Char Pattern Matching", () => {
    it("should match char literals", () => {
      const source = `
        frame test(x: char) ret int {
          return match (x) {
            'a' => 1,
            'z' => 2,
            '0' => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match char with guard", () => {
      const source = `
        frame test(x: char) ret int {
          return match (x) {
            'a' => 1,
            c if c >= 'A' && c <= 'Z' => 2,
            c if c >= '0' && c <= '9' => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Mixed Patterns", () => {
    it("should mix literals, identifiers, and guards", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            0 => 1,
            5 => 2,
            n if n > 100 => 3,
            n if n < 0 => 4,
            n => n
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should handle multiple literals before guard", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            1 => 1,
            2 => 2,
            3 => 3,
            4 => 4,
            5 => 5,
            n if n > 10 => 10,
            _ => 0
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Pattern Matching in Expressions", () => {
    it("should use match in variable assignment", () => {
      const source = `
        extern printf(fmt: string, ...);
        frame test() {
          local x: int = 5;
          local result: int = match (x) {
            0 => 1,
            5 => 2,
            _ => 3
          };
          printf("%d", result);
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should use match in function argument", () => {
      const source = `
        extern printf(fmt: string, ...);
        frame test(x: int) {
          printf("%d", match (x) {
            0 => 1,
            5 => 2,
            _ => 3
          });
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should use match in return statement", () => {
      const source = `
        frame test(x: int) ret int {
          return match (x) {
            0 => 1,
            5 => 2,
            _ => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should nest match expressions", () => {
      const source = `
        frame test(x: int, y: int) ret int {
          return match (x) {
            0 => match (y) {
              0 => 1,
              _ => 2
            },
            _ => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });
});
