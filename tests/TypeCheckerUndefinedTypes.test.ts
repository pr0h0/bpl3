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

describe("TypeChecker undefined types", () => {
  test("codes undefined variable declaration types", () => {
    const source = `
      frame main() ret int {
        local value: MissingThing;
        return 0;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Undefined type 'MissingThing'");
    expect(error.hint).toContain("The type is not defined.");
    expect(error.code).toBe("BPL_TYPE_NOT_FOUND");
  });

  test("rejects and codes undefined struct field types", () => {
    const source = `
      struct Container {
        value: MissingThing,
      }

      frame main() ret int {
        return 0;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Undefined type 'MissingThing'");
    expect(error.hint).toContain("The type is not defined.");
    expect(error.code).toBe("BPL_TYPE_NOT_FOUND");
  });
});
