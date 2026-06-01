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
