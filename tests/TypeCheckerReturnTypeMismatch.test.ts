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

function expectReturnTypeMismatch(
  source: string,
  messagePart: string,
): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes(messagePart),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe("BPL_RETURN_TYPE_MISMATCH");
  expect(error?.hint).toContain(
    "Ensure the returned value matches the function's return type.",
  );
  return error!;
}

describe("TypeChecker return type mismatch diagnostics", () => {
  test("codes mismatched return values", () => {
    const cases = [
      {
        message: "Return type mismatch: expected i32, got *i8",
        source: `
          frame main() ret int {
            return "wrong";
          }
        `,
      },
      {
        message: "Return type mismatch: expected i32, got void",
        source: `
          frame main() ret int {
            return;
          }
        `,
      },
    ];

    for (const { source, message } of cases) {
      expectReturnTypeMismatch(source, message);
    }
  });

  test("preserves valid return compatibility", () => {
    const source = `
      frame fitsLiteral() ret i8 {
        return 7;
      }

      frame exits() ret void {
        return;
      }

      frame main() ret int {
        return fitsLiteral();
      }
    `;

    expect(collectErrors(source)).toEqual([]);
  });
});
