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

function expectTuplePatternError(
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

describe("TypeChecker tuple pattern diagnostics", () => {
  test("codes tuple patterns used on non-tuple values", () => {
    expectTuplePatternError(
      `
        frame main() ret int {
          local value: int = 1;
          return match (value) {
            (left, right) => left,
            _ => 0,
          };
        }
      `,
      "Tuple pattern used on non-tuple type",
      "BPL_MATCH_TUPLE_PATTERN_TYPE_MISMATCH",
      "Expected tuple type, got BasicType",
    );
  });

  test("codes tuple pattern element-count mismatches", () => {
    expectTuplePatternError(
      `
        frame main() ret int {
          local pair: (int, int) = (1, 2);
          return match (pair) {
            (left, middle, right) => left,
            _ => 0,
          };
        }
      `,
      "Tuple pattern has 3 elements, but type has 2",
      "BPL_MATCH_TUPLE_PATTERN_ARITY_MISMATCH",
      "Pattern and type must have the same number of elements",
    );
  });

  test("preserves valid tuple pattern matching", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local pair: (int, bool) = (1, true);
        return match (pair) {
          (value, true) => value,
          (value, false) => -value,
        };
      }
    `);

    expect(errors).toEqual([]);
  });
});
