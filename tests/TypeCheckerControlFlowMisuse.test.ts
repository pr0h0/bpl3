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

function expectControlFlowError(
  source: string,
  messagePart: string,
  code: string,
  hintPart: string,
): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes(messagePart),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe(code);
  expect(error?.hint).toContain(hintPart);
  return error!;
}

describe("TypeChecker control-flow misuse diagnostics", () => {
  test("codes break outside loops or switches", () => {
    expectControlFlowError(
      `
        frame main() ret int {
          break;
          return 0;
        }
      `,
      "'break' statement outside of loop or switch",
      "BPL_BREAK_OUTSIDE_CONTEXT",
      "Break statements can only be used inside loops or switch statements.",
    );
  });

  test("codes continue outside loops", () => {
    expectControlFlowError(
      `
        frame main() ret int {
          continue;
          return 0;
        }
      `,
      "'continue' statement outside of loop",
      "BPL_CONTINUE_OUTSIDE_LOOP",
      "Continue statements can only be used inside loops.",
    );
  });

  test("codes fallthrough outside switches", () => {
    expectControlFlowError(
      `
        frame main() ret int {
          fallthrough;
          return 0;
        }
      `,
      "'fallthrough' statement outside of switch",
      "BPL_FALLTHROUGH_OUTSIDE_SWITCH",
      "Fallthrough statements can only be used inside switch statements.",
    );
  });

  test("codes return values inside defer blocks", () => {
    expectControlFlowError(
      `
        frame main() ret int {
          defer {
            return 1;
          }
          return 0;
        }
      `,
      "Return with value not allowed in defer block",
      "BPL_DEFER_RETURN_VALUE_INVALID",
      "Defer blocks must return void.",
    );
  });

  test("preserves valid break, continue, fallthrough, and defer return forms", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local value: int = 0;

        loop (value < 3) {
          value = value + 1;
          if (value == 1) {
            continue;
          }
          if (value == 2) {
            break;
          }
        }

        defer {
          return;
        }

        switch (value) {
          case 0: {
            fallthrough;
          }
          case 1: {
            break;
          }
          default: {
            break;
          }
        }

        return value;
      }
    `);

    expect(errors).toEqual([]);
  });
});
