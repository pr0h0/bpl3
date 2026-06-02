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

function expectTypeQueryError(
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

describe("TypeChecker type-query diagnostics", () => {
  test("codes unresolved enum paths in match<T>(value)", () => {
    expectTypeQueryError(
      `
        frame main() {
          local value: int = 1;
          local _ok: bool = match<Missing.Some>(value);
        }
      `,
      "Cannot find enum 'Missing'",
      "BPL_TYPE_QUERY_ENUM_NOT_FOUND",
      "The type 'Missing' in match<Missing.Some> is not a defined enum.",
    );
  });

  test("codes unresolved plain types in match<T>(value)", () => {
    expectTypeQueryError(
      `
        frame main() {
          local value: int = 1;
          local _ok: bool = match<MissingType>(value);
        }
      `,
      "Unknown type 'MissingType'",
      "BPL_TYPE_QUERY_TYPE_NOT_FOUND",
      "The type 'MissingType' in match<MissingType> is not defined.",
    );
  });

  test("codes unresolved types in is expressions", () => {
    expectTypeQueryError(
      `
        frame main() {
          local value: int = 1;
          if (value is MissingType) {}
        }
      `,
      "Unknown type: MissingType",
      "BPL_TYPE_QUERY_TYPE_NOT_FOUND",
      "Ensure the type is defined.",
    );

    expectTypeQueryError(
      `
        frame main() {
          local value: int = 1;
          if (value is Missing.Some) {}
        }
      `,
      "Cannot find enum 'Missing'",
      "BPL_TYPE_QUERY_ENUM_NOT_FOUND",
      "The type 'Missing' in 'is' expression is not a defined enum.",
    );
  });

  test("preserves valid type-query expressions", () => {
    const errors = collectErrors(`
      enum Color {
        Red,
        Blue,
      }

      frame main() {
        local color: Color = Color.Red;
        local value: int = 1;
        local _is_int: bool = value is int;
        local _is_red: bool = match<Color.Red>(color);
      }
    `);

    expect(errors).toEqual([]);
  });
});
