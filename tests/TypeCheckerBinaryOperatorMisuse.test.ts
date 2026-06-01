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

function expectBinaryOperatorError(
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

describe("TypeChecker binary operator misuse diagnostics", () => {
  test("codes unsupported string concatenation", () => {
    expectBinaryOperatorError(
      `
        frame main() ret string {
          return "left" + "right";
        }
      `,
      "String concatenation with '+' is not supported.",
      "BPL_STRING_CONCAT_UNSUPPORTED",
      "Use 'string_concat(a, b)' or similar helper functions.",
    );
  });

  test("codes logical operand type mismatches", () => {
    expectBinaryOperatorError(
      `
        frame main() ret bool {
          return true && 1;
        }
      `,
      "Logical operators require boolean operands",
      "BPL_LOGICAL_OPERAND_TYPE_MISMATCH",
      "Ensure both operands are boolean expressions.",
    );
  });

  test("codes comparison operand type mismatches", () => {
    expectBinaryOperatorError(
      `
        frame main() ret bool {
          return 1 < "wrong";
        }
      `,
      "Cannot compare int and string",
      "BPL_COMPARISON_TYPE_MISMATCH",
      "Operands must be of compatible types.",
    );
  });

  test("codes bitwise and modulo operand type mismatches", () => {
    expectBinaryOperatorError(
      `
        frame main() ret int {
          return 1 & 1.5;
        }
      `,
      "Bitwise operators require integer operands",
      "BPL_BITWISE_OPERAND_TYPE_MISMATCH",
      "Ensure both operands are integers.",
    );

    expectBinaryOperatorError(
      `
        frame main() ret int {
          return 1 % 1.5;
        }
      `,
      "Modulo operator requires integer operands",
      "BPL_MODULO_OPERAND_TYPE_MISMATCH",
      "Ensure both operands are integers.",
    );
  });

  test("codes generic binary and arithmetic operand mismatches", () => {
    expectBinaryOperatorError(
      `
        frame main() ret int {
          return 1 + "wrong";
        }
      `,
      "Type mismatch: int and string",
      "BPL_BINARY_OPERAND_TYPE_MISMATCH",
      "Ensure operands have compatible types.",
    );

    expectBinaryOperatorError(
      `
        struct Box {
          value: int,
        }

        frame main() ret Box {
          local left: Box = Box { value: 1 };
          local right: Box = Box { value: 2 };
          return left + right;
        }
      `,
      "Operator '+' cannot be applied to types 'Box' and 'Box'",
      "BPL_ARITHMETIC_OPERAND_TYPE_MISMATCH",
      "Arithmetic operators require numeric types.",
    );
  });

  test("codes pointer arithmetic and difference mismatches", () => {
    expectBinaryOperatorError(
      `
        frame main() ret *void {
          local ptr: *void = nullptr;
          return ptr + 1;
        }
      `,
      "Cannot perform pointer arithmetic on void pointer",
      "BPL_POINTER_ARITHMETIC_VOID",
      "Cast to a sized pointer type first",
    );

    expectBinaryOperatorError(
      `
        frame main() ret i64 {
          local left: *int = nullptr;
          local right: *float = nullptr;
          return left - right;
        }
      `,
      "Cannot compare pointer difference between",
      "BPL_POINTER_DIFFERENCE_TYPE_MISMATCH",
      "Pointer subtraction requires compatible pointee types.",
    );
  });

  test("preserves valid binary operator forms", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local ints: int[2];
        local ptr: *int = ints;
        local next: *int = ptr + 1;
        local diff: i64 = next - ptr;
        local flag: bool = (1 < 2) && (diff == 1);
        if (flag || false) {
          return (1 & 3) + (10 % 4);
        }
        return 0;
      }
    `);

    expect(errors).toEqual([]);
  });
});
