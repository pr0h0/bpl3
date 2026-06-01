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

function expectConditionMismatch(
  source: string,
  messagePart: string,
): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes(messagePart),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe("BPL_CONDITION_TYPE_MISMATCH");
  expect(error?.hint).toContain(
    "Ensure the condition evaluates to a boolean.",
  );
  return error!;
}

describe("TypeChecker condition type mismatch diagnostics", () => {
  test("codes non-boolean if and loop conditions", () => {
    expectConditionMismatch(
      `
        frame main() ret int {
          if (1) {
            return 1;
          }
          return 0;
        }
      `,
      "If condition must be boolean, got int",
    );

    expectConditionMismatch(
      `
        frame main() ret int {
          loop (1) {
            break;
          }
          return 0;
        }
      `,
      "Loop condition must be boolean, got int",
    );
  });

  test("preserves valid boolean conditions", () => {
    const source = `
      frame main() ret int {
        local value: int = 0;
        if (value < 1) {
          value = value + 1;
        }
        loop (value < 2) {
          value = value + 1;
          break;
        }
        return value;
      }
    `;

    expect(collectErrors(source)).toEqual([]);
  });
});
