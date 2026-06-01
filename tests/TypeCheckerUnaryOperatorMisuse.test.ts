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

function expectUnaryOperatorError(
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

describe("TypeChecker unary operator misuse diagnostics", () => {
  test("codes dereference target mismatches", () => {
    expectUnaryOperatorError(
      `
        frame main() ret int {
          return *1;
        }
      `,
      "Cannot dereference non-pointer type int",
      "BPL_DEREFERENCE_TARGET_INVALID",
      "Dereference requires a pointer type.",
    );
  });

  test("codes logical-not and bitwise-not operand mismatches", () => {
    expectUnaryOperatorError(
      `
        frame main() ret int {
          local result: bool = !1;
          return 0;
        }
      `,
      "Logical not requires boolean operand",
      "BPL_LOGICAL_NOT_OPERAND_TYPE_MISMATCH",
      "Ensure the operand is a boolean expression.",
    );

    expectUnaryOperatorError(
      `
        frame main() ret int {
          return ~1.5;
        }
      `,
      "Bitwise not requires integer operand",
      "BPL_BITWISE_NOT_OPERAND_TYPE_MISMATCH",
      "Ensure the operand is an integer.",
    );
  });

  test("codes unary negation operand mismatches and unsupported unary plus", () => {
    expectUnaryOperatorError(
      `
        frame main() ret int {
          return -"wrong";
        }
      `,
      "Unary operator '-' cannot be applied to type 'string'",
      "BPL_UNARY_NEGATION_OPERAND_TYPE_MISMATCH",
      "Negation requires a numeric type.",
    );

    expectUnaryOperatorError(
      `
        frame main() ret int {
          return +1;
        }
      `,
      "Unary plus operator '+' is not supported",
      "BPL_UNARY_PLUS_UNSUPPORTED",
      "Simply remove the '+' prefix.",
    );
  });

  test("preserves valid unary operator forms", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local value: int = 10;
        local ptr: *int = &value;
        local deref: int = *ptr;
        local flag: bool = !false;
        local bits: int = ~1;
        if (flag) {
          return -deref + bits;
        }
        return deref;
      }
    `);

    expect(errors).toEqual([]);
  });
});
