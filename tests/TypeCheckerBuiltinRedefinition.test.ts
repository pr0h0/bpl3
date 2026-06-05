import { describe, expect, test } from "bun:test";

import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function collectErrors(
  source: string,
  filePath: string = "test.bpl",
): CompilerError[] {
  const tokens = lexWithGrammar(source, filePath);
  const parser = new Parser(source, filePath, tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker({ collectAllErrors: true });
  typeChecker.checkProgram(program);
  return typeChecker.getErrors();
}

function expectBuiltinRedefinitionError(
  source: string,
  builtinName: string,
  filePath: string = "test.bpl",
): CompilerError {
  const error = collectErrors(source, filePath).find((candidate) =>
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

  test("allows reserved runtime type declarations in their stdlib owner modules", () => {
    const allowedCases = [
      ["/tmp/lib/type.bpl", "type Any = int;"],
      ["/tmp/lib/type.bpl", "type Type = int;"],
      ["/tmp/lib/reflection.bpl", "type TypeInfo = int;"],
      ["/tmp/lib/errors.bpl", "struct NullAccessError { value: int, }"],
      ["/tmp/lib/primitives.bpl", "struct Int { value: int, }"],
    ] as const;

    for (const [filePath, source] of allowedCases) {
      expect(collectErrors(source, filePath)).toEqual([]);
    }

    expectBuiltinRedefinitionError("type Any = int;", "Any", "/tmp/app.bpl");
    expectBuiltinRedefinitionError(
      "type TypeInfo = int;",
      "TypeInfo",
      "/tmp/lib/type.bpl",
    );
  });
});
