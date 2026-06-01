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

function expectCallSiteError(
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

describe("TypeChecker call-site mismatch diagnostics", () => {
  test("codes non-callable call targets", () => {
    expectCallSiteError(
      `
        struct Box {}

        frame main() ret int {
          local box: Box;
          box();
          return 0;
        }
      `,
      "Type 'Box' is not callable",
      "BPL_CALL_TARGET_NOT_CALLABLE",
      "Only functions or types with __call__ operator can be called.",
    );
  });

  test("codes function argument count and type mismatches", () => {
    expectCallSiteError(
      `
        frame take(value: int) ret int {
          return value;
        }

        frame main() ret int {
          return take();
        }
      `,
      "No matching function for call to 'take' with 0 arguments",
      "BPL_CALL_ARGUMENT_COUNT_MISMATCH",
      "Available overloads:",
    );

    expectCallSiteError(
      `
        frame take(value: int) ret int {
          return value;
        }

        frame main() ret int {
          return take("wrong");
        }
      `,
      "No matching function for call to 'take' with provided argument types.",
      "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      "Available overloads:",
    );
  });

  test("codes enum variant argument count and type mismatches", () => {
    expectCallSiteError(
      `
        enum Message {
          Move(int, int),
          Quit,
        }

        frame main() ret int {
          local msg: Message = Message.Move(1);
          return 0;
        }
      `,
      "Enum variant 'Move' expects 2 arguments, but got 1",
      "BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH",
      "Usage: Message.Move(",
    );

    expectCallSiteError(
      `
        enum Message {
          Move(int, int),
          Quit,
        }

        frame main() ret int {
          local msg: Message = Message.Quit(1);
          return 0;
        }
      `,
      "Unit variant 'Quit' does not take any arguments",
      "BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH",
      "Use: Message.Quit",
    );

    expectCallSiteError(
      `
        enum Message {
          Move(int, int),
          Quit,
        }

        frame main() ret int {
          local msg: Message = Message.Move(1, "wrong");
          return 0;
        }
      `,
      "Type mismatch for argument 2 of 'Move': expected",
      "BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH",
      "Check the variant definition and argument types.",
    );
  });

  test("preserves valid function, lambda, callable object, and enum calls", () => {
    const errors = collectErrors(`
      enum Message {
        Move(int, int),
        Quit,
      }

      struct Counter {
        frame __call__(this: *Counter, amount: int) ret int {
          return amount + 1;
        }
      }

      frame add(left: int, right: int) ret int {
        return left + right;
      }

      frame main() ret int {
        local counter: Counter;
        local bump: Lambda<int>(int) = |value: int| ret int {
          return value + 1;
        };
        local moved: Message = Message.Move(1, 2);
        match (moved) {
          Message.Move(x, y) => {
            return add(counter(x), bump(y));
          },
          Message.Quit => {
            return 0;
          },
        }
      }
    `);

    expect(errors).toEqual([]);
  });
});
