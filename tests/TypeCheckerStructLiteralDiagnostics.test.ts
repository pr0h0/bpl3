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

function expectStructLiteralError(
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

describe("TypeChecker struct literal diagnostics", () => {
  test("codes unknown struct literal targets", () => {
    expectStructLiteralError(
      `
        frame main() ret int {
          local value: int = Missing { value: 1 };
          return value;
        }
      `,
      "Unknown struct 'Missing'",
      "BPL_STRUCT_LITERAL_UNKNOWN_STRUCT",
      "Ensure the struct is defined.",
    );
  });

  test("codes generic arity mismatches in struct literals", () => {
    expectStructLiteralError(
      `
        struct Box<T> {
          value: T,
        }

        frame main() ret int {
          local box: Box<i32> = Box<i32, bool> { value: 1 };
          return box.value;
        }
      `,
      "Generic type 'Box' expects 1 arguments, but got 2",
      "BPL_GENERIC_ARITY_MISMATCH",
      "Provide the correct number of generic arguments.",
    );
  });

  test("codes missing struct literal fields", () => {
    expectStructLiteralError(
      `
        struct Point {
          x: i32,
          y: i32,
        }

        frame main() ret int {
          local point: Point = Point { x: 1 };
          return point.x;
        }
      `,
      "Missing field 'y' in struct literal for 'Point'",
      "BPL_STRUCT_LITERAL_FIELD_MISSING",
      "Field 'y' is required.",
    );
  });

  test("codes unknown struct literal fields", () => {
    expectStructLiteralError(
      `
        struct Point {
          x: i32,
          y: i32,
        }

        frame main() ret int {
          local point: Point = Point { x: 1, y: 2, z: 3 };
          return point.x;
        }
      `,
      "Unknown field 'z' in struct 'Point'",
      "BPL_STRUCT_LITERAL_FIELD_UNKNOWN",
      "Check the struct definition for valid fields.",
    );
  });

  test("codes struct literal field type mismatches", () => {
    expectStructLiteralError(
      `
        struct Point {
          x: i32,
          y: i32,
        }

        frame main() ret int {
          local point: Point = Point { x: "wrong", y: 2 };
          return point.x;
        }
      `,
      "Type mismatch for field 'x': expected i32, got",
      "BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH",
      "Field value must match the declared type.",
    );
  });

  test("preserves valid concrete and generic struct literals", () => {
    const errors = collectErrors(`
      struct Point {
        x: i32,
        y: i32,
      }

      struct Box<T> {
        value: T,
      }

      frame main() ret int {
        local point: Point = Point { x: 1, y: 2 };
        local box: Box<i32> = Box<i32> { value: point.x };
        return box.value + point.y;
      }
    `);

    expect(errors).toEqual([]);
  });
});
