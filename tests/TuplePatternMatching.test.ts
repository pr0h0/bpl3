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

describe("Tuple Pattern Matching", () => {
  describe("Basic Tuple Patterns", () => {
    it("should match tuple with all literals", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (0, 0) => 1,
            (1, 2) => 2,
            (3, 4) => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match tuple with identifiers", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (a, b) => a + b
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match tuple with mixed patterns", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (0, 0) => 1,
            (1, b) => b,
            (a, 0) => a,
            (a, b) => a + b
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match tuple with wildcards", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (0, _) => 1,
            (_, 0) => 2,
            (_, _) => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Tuple Patterns with Guards", () => {
    it("should match tuple with simple guard", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (a, b) if a == b => 1,
            (a, b) if a > b => 2,
            (a, b) if a < b => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match tuple with complex guard", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (a, b) if a + b == 10 => 1,
            (a, b) if a * b > 100 => 2,
            (a, b) if a % 2 == 0 && b % 2 == 0 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match tuple literal with identifier guard", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (0, b) if b > 0 => 1,
            (a, 0) if a > 0 => 2,
            _ => 3
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Different Tuple Types", () => {
    it("should match (int, bool) tuple", () => {
      const source = `
        frame test(pair: (int, bool)) ret int {
          return match (pair) {
            (0, true) => 1,
            (0, false) => 2,
            (n, true) => n,
            (n, false) => -n
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match (string, int) tuple", () => {
      const source = `
        extern strlen(s: string) ret int;
        frame test(pair: (string, int)) ret int {
          return match (pair) {
            ("", 0) => 1,
            ("hello", 5) => 2,
            (s, n) if strlen(s) == n => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match (float, float) tuple", () => {
      const source = `
        frame test(pair: (float, float)) ret int {
          return match (pair) {
            (0.0, 0.0) => 1,
            (1.0, 1.0) => 2,
            (x, y) if x == y => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match (char, char) tuple", () => {
      const source = `
        frame test(pair: (char, char)) ret int {
          return match (pair) {
            ('a', 'b') => 1,
            ('x', 'y') => 2,
            (c1, c2) if c1 == c2 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Three-Element Tuples", () => {
    it("should match (int, int, int) tuple", () => {
      const source = `
        frame test(triple: (int, int, int)) ret int {
          return match (triple) {
            (0, 0, 0) => 1,
            (1, 2, 3) => 2,
            (a, b, c) if a + b + c == 0 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should match mixed three-element tuple", () => {
      const source = `
        frame test(triple: (int, bool, string)) ret int {
          return match (triple) {
            (0, true, "") => 1,
            (n, true, s) => n,
            (n, false, s) => -n,
            _ => 0
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Tuple Pattern Edge Cases", () => {
    it("should handle all wildcards", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (_, _) => 1
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should handle single wildcard arm", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (1, 2) => 1,
            _ => 2
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should handle positive numbers in tuple", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (1, 1) => 1,
            (5, 0) => 2,
            (0, 5) => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should handle guards with both elements", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (a, b) if a > 0 && b > 0 => 1,
            (a, b) if a < 0 && b < 0 => 2,
            (a, b) if a == 0 || b == 0 => 3,
            _ => 4
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Tuple Patterns in Various Contexts", () => {
    it("should use tuple match in assignment", () => {
      const source = `
        extern printf(fmt: string, ...);
        frame test() {
          local pair: (int, int) = (5, 10);
          local result: int = match (pair) {
            (0, 0) => 0,
            (a, b) => a + b
          };
          printf("%d", result);
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should use tuple match in return", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (0, 0) => 0,
            (a, b) => a * b
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should nest tuple matches", () => {
      const source = `
        frame test(p1: (int, int), p2: (int, int)) ret int {
          return match (p1) {
            (0, 0) => match (p2) {
              (0, 0) => 0,
              _ => 1
            },
            _ => 2
          };
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Error Cases", () => {
    it("should reject tuple pattern count mismatch", () => {
      const source = `
        frame test(pair: (int, int)) ret int {
          return match (pair) {
            (a, b, c) => 1,
            _ => 2
          };
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });
  });
});
