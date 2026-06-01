import { describe, expect, test } from "bun:test";

import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function collectErrors(source: string): CompilerError[] {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker({ collectAllErrors: true });
  typeChecker.checkProgram(program);
  return typeChecker.getErrors();
}

describe("TypeChecker assignment mismatch diagnostics", () => {
  test("codes direct assignment type mismatches", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local value: int = 1;
        value = "wrong";
        return value;
      }
    `);

    const error = errors.find((candidate) =>
      candidate.message.includes("Type mismatch in assignment"),
    );

    expect(error).toBeDefined();
    expect(error).toBeInstanceOf(CompilerError);
    expect(error?.code).toBe("BPL_ASSIGNMENT_TYPE_MISMATCH");
    expect(error?.message).toContain("cannot assign string to i32");
    expect(error?.hint).toContain(
      "The assigned value is not compatible with the target variable's type.",
    );
  });

  test("preserves legacy E001 for variable initializer mismatches", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local _value: int = "wrong";
        return 0;
      }
    `);

    const error = errors.find((candidate) =>
      candidate.message.includes("Type mismatch: cannot assign"),
    );

    expect(error).toBeDefined();
    expect(error).toBeInstanceOf(CompilerError);
    expect(error?.code).toBe("E001");
    expect(error?.message).toContain("cannot assign *i8 to i32");
    expect(error?.hint).toContain(
      "Ensure the initializer type matches the declared type.",
    );
  });
});
