import { describe, expect, test } from "bun:test";

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
  const [error] = typeChecker.getErrors();
  if (error) throw error;
}

function expectCompilerError(source: string): CompilerError {
  try {
    check(source);
  } catch (error) {
    expect(error).toBeInstanceOf(CompilerError);
    return error as CompilerError;
  }

  throw new Error("Expected type checking to fail");
}

describe("TypeChecker duplicate symbols", () => {
  test("rejects duplicate top-level non-function symbols in the same scope", () => {
    const source = `
      struct Thing { value: int, }
      struct Thing { other: int, }

      frame main() ret int {
        return 0;
      }
    `;

    expect(() => check(source)).toThrow(CompilerError);
    expect(() => check(source)).toThrow("already defined in this scope");
  });

  test("rejects top-level declarations that reuse a non-function symbol name", () => {
    const source = `
      type Thing = int;
      struct Thing { value: int, }

      frame main() ret int {
        return 0;
      }
    `;

    expect(() => check(source)).toThrow(CompilerError);
    expect(() => check(source)).toThrow("already defined in this scope");
  });

  test("codes duplicate function signatures as duplicate symbols", () => {
    const source = `
      frame pick(value: int) ret int { return value; }
      frame pick(value: int) ret int { return value + 1; }

      frame main() ret int {
        return pick(1);
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain(
      "Function 'pick' with this signature is already defined.",
    );
    expect(error.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
  });

  test("codes duplicate function parameters as duplicate symbols", () => {
    const source = `
      frame pick(value: int, value: int) ret int {
        return value;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Duplicate parameter name 'value'");
    expect(error.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
  });

  test("codes duplicate generic parameters as duplicate symbols", () => {
    const source = `
      frame identity<T, T>(value: T) ret T {
        return value;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Duplicate generic type parameter 'T'");
    expect(error.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
  });

  test("codes duplicate struct fields as duplicate symbols", () => {
    const source = `
      struct Point {
        x: int,
        x: int,
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Duplicate field 'x' in struct 'Point'");
    expect(error.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
  });

  test("codes duplicate enum variants as duplicate symbols", () => {
    const source = `
      enum Color {
        Red,
        Red,
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Duplicate enum variant 'Red'");
    expect(error.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
  });

  test("preserves valid function overloads", () => {
    const source = `
      frame pick(value: int) ret int { return value; }
      frame pick(value: bool) ret int {
        if (value) {
          return 1;
        }
        return 0;
      }

      frame main() ret int {
        return pick(1) + pick(true);
      }
    `;

    expect(() => check(source)).not.toThrow();
  });
});
