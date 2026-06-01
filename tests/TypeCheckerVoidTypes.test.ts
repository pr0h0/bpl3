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

function expectVoidTypeError(
  source: string,
  messagePart: string,
): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes(messagePart),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe("BPL_VOID_TYPE_INVALID");
  expect(error?.hint).toContain("Use '*void' for void pointers.");
  return error!;
}

describe("TypeChecker void type diagnostics", () => {
  test("codes invalid bare void in value-bearing declarations", () => {
    const cases = [
      {
        message: "Variable 'value' cannot be void",
        source: `
          frame main() ret int {
            local value: void;
            return 0;
          }
        `,
      },
      {
        message: "Variable 'items' cannot be void",
        source: `
          frame main() ret int {
            local items: void[4];
            return 0;
          }
        `,
      },
      {
        message: "Variable 'slice' cannot be void",
        source: `
          frame main() ret int {
            local slice: void[];
            return 0;
          }
        `,
      },
      {
        message: "Parameter 'value' cannot be of type 'void'",
        source: `
          frame takesVoid(value: void) ret void {
            return;
          }
        `,
      },
      {
        message: "Struct field 'value' cannot be void",
        source: `
          struct Container {
            value: void,
          }
        `,
      },
      {
        message: "Generic type argument cannot be 'void'",
        source: `
          struct Box<T> {
            value: T,
          }

          frame main() ret int {
            local box: Box<void>;
            return 0;
          }
        `,
      },
    ];

    for (const { source, message } of cases) {
      expectVoidTypeError(source, message);
    }
  });

  test("allows void only in return and pointer-shaped positions", () => {
    const source = `
      struct Container {
        raw: *void,
      }

      type Callback = Func<void>(*void);

      frame takesPointer(value: *void) ret void {
        local raw: *void = value;
        local array: *void[2];
        if (raw == nullptr) {
          return;
        }
        if (array[0] == nullptr) {
          return;
        }
      }
    `;

    expect(collectErrors(source)).toEqual([]);
  });
});
