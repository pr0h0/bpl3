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

function expectIntrinsicCallError(
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

describe("TypeChecker intrinsic call diagnostics", () => {
  test("codes missing and extra intrinsic generic arguments", () => {
    expectIntrinsicCallError(
      `
        frame main() ret int {
          local id: u64 = __type_id();
          return 0;
        }
      `,
      "Intrinsic __type_id requires exactly 1 generic argument",
      "BPL_INTRINSIC_GENERIC_ARITY_MISMATCH",
      "Use __type_id<T>() with exactly one type argument.",
    );

    expectIntrinsicCallError(
      `
        frame main() ret int {
          __type_info<int, bool>();
          return 0;
        }
      `,
      "Intrinsic __type_info requires exactly 1 generic argument",
      "BPL_INTRINSIC_GENERIC_ARITY_MISMATCH",
      "Use __type_info<T>() with exactly one type argument.",
    );
  });

  test("codes forbidden intrinsic value arguments", () => {
    expectIntrinsicCallError(
      `
        frame main() ret int {
          local id: u64 = __type_id<int>(1);
          return 0;
        }
      `,
      "Intrinsic __type_id accepts no arguments",
      "BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH",
      "Call __type_id<T>() without value arguments.",
    );

    expectIntrinsicCallError(
      `
        frame main() ret int {
          __type_info<int>(1);
          return 0;
        }
      `,
      "Intrinsic __type_info accepts no arguments",
      "BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH",
      "Call __type_info<T>() without value arguments.",
    );
  });

  test("preserves valid intrinsic calls", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local id: u64 = __type_id<int>();
        __type_info<int>();
        return cast<int>(id);
      }
    `);

    expect(errors).toEqual([]);
  });
});
