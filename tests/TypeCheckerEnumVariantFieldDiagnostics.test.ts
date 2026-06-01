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

function expectEnumVariantFieldError(
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

describe("TypeChecker enum variant field diagnostics", () => {
  test("codes unknown enum struct variant construction fields", () => {
    expectEnumVariantFieldError(
      `
        enum Event {
          MouseMove { x: int, y: int },
        }

        frame main() ret int {
          local event: Event = Event.MouseMove { x: 1, y: 2, z: 3 };
          return 0;
        }
      `,
      "Unknown field 'z' in variant 'MouseMove'",
      "BPL_ENUM_VARIANT_FIELD_UNKNOWN",
      "Check the variant definition.",
    );
  });

  test("codes enum struct variant construction field type mismatches", () => {
    expectEnumVariantFieldError(
      `
        enum Event {
          MouseMove { x: int, y: int },
        }

        frame main() ret int {
          local event: Event = Event.MouseMove { x: "bad", y: 2 };
          return 0;
        }
      `,
      "Type mismatch for field 'x': expected int, got",
      "BPL_ENUM_VARIANT_FIELD_TYPE_MISMATCH",
      "Field value must match the declared type.",
    );
  });

  test("codes unknown enum struct pattern fields", () => {
    expectEnumVariantFieldError(
      `
        enum Event {
          MouseMove { x: int, y: int },
        }

        frame main() ret int {
          local event: Event = Event.MouseMove { x: 1, y: 2 };
          return match (event) {
            Event.MouseMove { x: px, z: pz } => px,
          };
        }
      `,
      "Unknown field 'z' in variant 'MouseMove'",
      "BPL_ENUM_VARIANT_FIELD_UNKNOWN",
      "Check the variant definition.",
    );
  });

  test("preserves valid enum struct variant construction and patterns", () => {
    const errors = collectErrors(`
      enum Event {
        Click,
        MouseMove { x: int, y: int },
      }

      frame main() ret int {
        local event: Event = Event.MouseMove { x: 1, y: 2 };
        return match (event) {
          Event.Click => 0,
          Event.MouseMove { x: px, y: py } => px + py,
        };
      }
    `);

    expect(errors).toEqual([]);
  });
});
