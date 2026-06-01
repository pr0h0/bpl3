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

describe("TypeChecker generic arity diagnostics", () => {
  test("codes generic type argument-count mismatches", () => {
    const source = `
      struct Box<T> {
        value: T,
      }

      frame main() {
        local box: Box<int, bool>;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain(
      "Generic type 'Box' expects 1 type arguments, but got 2.",
    );
    expect(error.hint).toBe("Check generic argument count.");
    expect(error.code).toBe("BPL_GENERIC_ARITY_MISMATCH");
  });

  test("codes generic alias argument-count mismatches", () => {
    const source = `
      struct Box<T> {
        value: T,
      }

      type Alias<T> = Box<T>;

      frame main() {
        local box: Alias<int, bool>;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain(
      "Generic type 'Alias' expects 1 type arguments, but got 2.",
    );
    expect(error.hint).toBe("Check generic argument count.");
    expect(error.code).toBe("BPL_GENERIC_ARITY_MISMATCH");
  });
});
