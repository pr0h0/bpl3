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

function expectMatchExhaustivenessError(
  source: string,
  messagePart: string,
  hintPart: string,
): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes(messagePart),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe("BPL_MATCH_EXHAUSTIVENESS_MISMATCH");
  expect(error?.hint).toContain(hintPart);
  return error!;
}

describe("TypeChecker match exhaustiveness diagnostics", () => {
  test("codes enum matches missing variants", () => {
    expectMatchExhaustivenessError(
      `
        enum Color {
          Red,
          Blue,
        }

        frame main() ret int {
          local color: Color = Color.Red;
          return match (color) {
            Color.Red => 1,
          };
        }
      `,
      "Non-exhaustive match: missing variants: Blue",
      "Match expressions must handle all enum variants",
    );
  });

  test("codes non-enum matches missing default cases", () => {
    expectMatchExhaustivenessError(
      `
        frame main() ret int {
          local value: int = 1;
          return match (value) {
            1 => 10,
          };
        }
      `,
      "Non-exhaustive match: missing default case (_)",
      "Type matching requires a default case.",
    );
  });

  test("preserves exhaustive enum and non-enum matches", () => {
    const errors = collectErrors(`
      enum Color {
        Red,
        Blue,
      }

      frame main() ret int {
        local color: Color = Color.Red;
        local value: int = 1;
        return match (color) {
          Color.Red => 1,
          Color.Blue => match (value) {
            1 => 2,
            _ => 3,
          },
        };
      }
    `);

    expect(errors).toEqual([]);
  });

  test("treats irrefutable tuple destructuring patterns as exhaustive", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local pair: (int, int) = (1, 2);
        return match (pair) {
          (left, right) => left + right,
        };
      }
    `);

    expect(errors).toEqual([]);
  });
});
