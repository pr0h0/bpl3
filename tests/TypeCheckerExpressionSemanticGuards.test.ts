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

function expectExpressionGuardError(
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

describe("TypeChecker expression semantic guard diagnostics", () => {
  test("codes compile-time division and modulo by zero", () => {
    expectExpressionGuardError(
      `
        frame main() ret int {
          return 1 / 0;
        }
      `,
      "Division by zero",
      "BPL_DIVISION_BY_ZERO",
      "divisor in a division operation cannot be zero",
    );

    expectExpressionGuardError(
      `
        frame main() ret int {
          return 1 % 0;
        }
      `,
      "Division by zero",
      "BPL_DIVISION_BY_ZERO",
      "divisor in a modulo operation cannot be zero",
    );
  });

  test("codes invalid constant shift counts", () => {
    expectExpressionGuardError(
      `
        frame main() ret int {
          return 1 << -1;
        }
      `,
      "Negative shift count",
      "BPL_SHIFT_COUNT_INVALID",
      "Shift counts must be zero or greater.",
    );

    expectExpressionGuardError(
      `
        frame main() ret i8 {
          local value: i8 = 1;
          return value << 8;
        }
      `,
      "Shift count 8 is out of range",
      "BPL_SHIFT_COUNT_INVALID",
      "Use a shift count smaller than the width of the left operand.",
    );
  });

  test("codes address-of misuse guards", () => {
    expectExpressionGuardError(
      `
        frame main() ret int {
          local const value: int = 1;
          local ptr: *int = &value;
          return *ptr;
        }
      `,
      "Cannot take address of constant expression.",
      "BPL_ADDRESS_OF_CONSTANT",
      "does not support pointers to constants yet",
    );

    expectExpressionGuardError(
      `
        frame main() ret int {
          local ptr: *int = &(1, 2);
          return *ptr;
        }
      `,
      "Cannot take address of",
      "BPL_ADDRESS_OF_TARGET_INVALID",
      "Address-of requires an lvalue.",
    );
  });

  test("codes array literal element mismatches", () => {
    expectExpressionGuardError(
      `
        frame main() ret int {
          local values: int[] = [1, "two", 3];
          return values[0];
        }
      `,
      "Array literal has inconsistent element types",
      "BPL_ARRAY_LITERAL_TYPE_MISMATCH",
      "All elements in an array literal must have the same type.",
    );
  });

  test("codes invalid casts", () => {
    expectExpressionGuardError(
      `
        frame use(value: string) ret string { return value; }
        frame main() ret int {
          local value: int = 123;
          local text: string = cast<string>(value);
          use(text);
          return 0;
        }
      `,
      "Cannot cast integer type 'i32' to 'string'",
      "BPL_CAST_INTEGER_TO_STRING",
      "Use .toString() or similar conversion methods.",
    );

    expectExpressionGuardError(
      `
        struct Box {
          value: int,
        }

        frame main() ret int {
          local box: Box = cast<Box>(1);
          return box.value;
        }
      `,
      "Cannot cast i32 to Box",
      "BPL_CAST_INVALID",
      "This cast is not allowed.",
    );
  });

  test("codes sizeof void", () => {
    expectExpressionGuardError(
      `
        frame main() ret int {
          return cast<int>(sizeof<void>());
        }
      `,
      "Cannot take size of void",
      "BPL_SIZEOF_VOID_INVALID",
      "Void type has no size.",
    );
  });

  test("preserves valid guarded expression forms", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local value: int = 8;
        local ptr: *int = &value;
        local shifted: int = 1 << 3;
        local rem: int = 5 % 2;
        local div: int = 6 / 2;
        local values: int[3] = [1, 2, 3];
        local widened: long = cast<long>(value);
        local size: i64 = sizeof<int>();
        return shifted + rem + div + values[0] + *ptr + cast<int>(widened) + cast<int>(size);
      }
    `);

    expect(errors).toEqual([]);
  });
});
