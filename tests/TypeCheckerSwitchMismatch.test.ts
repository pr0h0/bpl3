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

function expectSwitchError(
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

describe("TypeChecker switch mismatch diagnostics", () => {
  test("codes invalid switch value types", () => {
    expectSwitchError(
      `
        frame main() ret int {
          local value: float = 1.5;
          switch (value) {
            default: {
              return 0;
            }
          }
        }
      `,
      "Switch value must be an integer, string or enum type, got double",
      "BPL_SWITCH_VALUE_TYPE_MISMATCH",
      "Ensure the switch expression evaluates to an integer, string or enum.",
    );
  });

  test("codes incompatible switch case pattern types", () => {
    expectSwitchError(
      `
        frame main() ret int {
          local value: int = 1;
          switch (value) {
            case "one": {
              return 1;
            }
            default: {
              return 0;
            }
          }
        }
      `,
      "Case pattern type string not compatible with switch value type i32",
      "BPL_SWITCH_CASE_TYPE_MISMATCH",
      "Ensure case patterns match the switch value type.",
    );
  });

  test("preserves valid integer and string switches", () => {
    expect(
      collectErrors(`
        frame main() ret int {
          local value: int = 1;
          switch (value) {
            case 1: {
              return 1;
            }
            default: {
              return 0;
            }
          }
        }
      `),
    ).toEqual([]);

    expect(
      collectErrors(`
        frame main() ret int {
          local value: string = "one";
          switch (value) {
            case "one": {
              return 1;
            }
            default: {
              return 0;
            }
          }
        }
      `),
    ).toEqual([]);
  });
});
