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

function expectBuiltinRedefinitionError(
  source: string,
  builtinName: string,
): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes(`Cannot redefine builtin type '${builtinName}'`),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe("BPL_BUILTIN_TYPE_REDEFINITION");
  expect(error?.hint).toContain("Builtin type names are reserved.");
  return error!;
}

describe("TypeChecker builtin type redefinition diagnostics", () => {
  test("codes attempts to redefine built-in type names", () => {
    const cases = [
      {
        builtinName: "int",
        source: "type int = i64;",
      },
      {
        builtinName: "bool",
        source: `
          struct bool {
            value: i1,
          }
        `,
      },
      {
        builtinName: "string",
        source: `
          enum string {
            Empty,
            NonEmpty,
          }
        `,
      },
      {
        builtinName: "void",
        source: `
          spec void {
            frame close(this: *Self) ret void;
          }
        `,
      },
    ];

    for (const { source, builtinName } of cases) {
      expectBuiltinRedefinitionError(source, builtinName);
    }
  });

  test("allows user type declarations with non-builtin names", () => {
    const source = `
      type Count = int;

      struct Counter {
        value: Count,
      }

      enum State {
        Ready,
        Done,
      }

      spec Disposable {
        frame close(this: *Self) ret void;
      }
    `;

    expect(collectErrors(source)).toEqual([]);
  });
});
