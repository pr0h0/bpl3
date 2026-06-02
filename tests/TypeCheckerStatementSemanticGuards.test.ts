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

function expectStatementGuardError(
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

describe("TypeChecker statement semantic guard diagnostics", () => {
  test("codes missing variable type annotations", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local value = [];
          return 0;
        }
      `,
      "Missing type annotation for variable 'value'",
      "BPL_VARIABLE_TYPE_ANNOTATION_MISSING",
      "Variables must have explicit type annotations.",
    );
  });

  test("codes duplicate local variable declarations", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local value: int = 1;
          local value: int = 2;
          return value;
        }
      `,
      "Variable 'value' is already declared in this scope",
      "BPL_VARIABLE_REDECLARATION",
      "Cannot redeclare 'value' in the same scope.",
    );
  });

  test("codes integer literal overflow in variable declarations", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local value: i8 = 128;
          return cast<int>(value);
        }
      `,
      "Integer overflow: value 128 does not fit in type i8",
      "BPL_INTEGER_LITERAL_OVERFLOW",
      "within the range of i8",
    );
  });

  test("codes assignment to constants", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local const value: int = 1;
          value = 2;
          return value;
        }
      `,
      "Cannot assign to constant 'value'",
      "BPL_ASSIGNMENT_TARGET_CONSTANT",
      "Constants cannot be modified.",
    );
  });

  test("codes invalid assignment targets", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          (1 + 2) = 3;
          return 0;
        }
      `,
      "Invalid assignment target",
      "BPL_ASSIGNMENT_TARGET_INVALID",
      "Left-hand side of assignment must be",
    );
  });

  test("codes invalid tuple destructuring assignment targets", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local a: int = 1;
          (a, 1) = (2, 3);
          return a;
        }
      `,
      "Invalid assignment target in tuple destructuring",
      "BPL_TUPLE_DESTRUCTURE_TARGET_INVALID",
      "Tuple elements in assignment must be valid l-values",
    );
  });

  test("codes tuple destructuring declaration target type mismatches", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local pair: (int, int) = (1, 2);
          local (text: string, value: int) = pair;
          return value;
        }
      `,
      "Type mismatch: cannot assign",
      "E001",
      "Ensure the destructuring target type matches the tuple element type.",
    );
  });

  test("codes tuple destructuring declaration target count mismatches", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local pair: (int, int) = (1, 2);
          local (left: int, middle: int, right: int) = pair;
          return left;
        }
      `,
      "Tuple destructuring has 3 targets, but initializer has 2 elements",
      "BPL_TUPLE_DESTRUCTURE_TARGET_INVALID",
      "Destructuring target count must match tuple element count.",
    );
  });

  test("codes nested tuple destructuring declarations over non-tuple elements", () => {
    expectStatementGuardError(
      `
        frame main() ret int {
          local pair: (int, int) = (1, 2);
          local ((left: int, right: int), value: int) = pair;
          return value;
        }
      `,
      "Nested tuple destructuring target used on non-tuple element",
      "BPL_TUPLE_DESTRUCTURE_TARGET_INVALID",
      "Nested destructuring targets require tuple elements.",
    );
  });

  test("preserves valid statement guard forms", () => {
    const errors = collectErrors(`
      frame main() ret int {
        local a: int = 1;
        local b: int = 2;
        local ptr: *int = &a;
        a = 3;
        *ptr = 4;
        (a, b) = (5, 6);
        return a + b;
      }
    `);

    expect(errors).toEqual([]);
  });
});
