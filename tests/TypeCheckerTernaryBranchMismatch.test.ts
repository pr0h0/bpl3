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

describe("TypeChecker ternary branch mismatch diagnostics", () => {
  test("codes incompatible ternary branch types", () => {
    const errors = collectErrors(`
      frame main() ret int {
        return true ? 1 : "wrong";
      }
    `);

    const error = errors.find((candidate) =>
      candidate.message.includes("Ternary branches must have compatible types"),
    );

    expect(error).toBeDefined();
    expect(error).toBeInstanceOf(CompilerError);
    expect(error?.code).toBe("BPL_TERNARY_BRANCH_TYPE_MISMATCH");
    expect(error?.message).toContain(
      "Ternary branches must have compatible types: int vs string",
    );
    expect(error?.hint).toContain("Both branches must return the same type.");
  });

  test("preserves compatible ternary branch types", () => {
    const errors = collectErrors(`
      frame main() ret int {
        return true ? 1 : 2;
      }
    `);

    expect(errors).toEqual([]);
  });
});
