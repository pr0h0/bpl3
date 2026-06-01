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

function expectIndexExpressionError(
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

describe("TypeChecker index expression misuse diagnostics", () => {
  test("codes array index type mismatches", () => {
    expectIndexExpressionError(
      `
        frame main() ret int {
          local values: int[3];
          return values[1.5];
        }
      `,
      "Array index must be an integer, got float",
      "BPL_ARRAY_INDEX_TYPE_MISMATCH",
      "Ensure the index expression evaluates to an integer.",
    );
  });

  test("codes pointer index type mismatches", () => {
    expectIndexExpressionError(
      `
        frame main() ret int {
          local value: int = 1;
          local ptr: *int = &value;
          return ptr[true];
        }
      `,
      "Pointer index must be an integer, got bool",
      "BPL_POINTER_INDEX_TYPE_MISMATCH",
      "Ensure the index expression evaluates to an integer.",
    );
  });

  test("codes non-indexable targets", () => {
    expectIndexExpressionError(
      `
        frame main() ret int {
          local value: int = 1;
          return value[0];
        }
      `,
      "Type 'i32' is not indexable",
      "BPL_INDEX_TARGET_NOT_INDEXABLE",
      "Only arrays, pointers, or types with __get__ operator can be indexed.",
    );
  });

  test("preserves valid array, pointer, alias-pointer, and __get__ indexing", () => {
    const errors = collectErrors(`
      type IntPtr = *int;

      struct Box {
        value: int,
        frame __get__(this: *Box, index: int) ret int {
          return this.value + index;
        }
      }

      frame main() ret int {
        local values: int[3];
        local first: int = values[0];
        local ptr: *int = &first;
        local viaPointer: int = ptr[0];
        local aliasPtr: IntPtr = ptr;
        local viaAliasPointer: int = aliasPtr[0];
        local box: Box = Box { value: 40 };
        local viaGet: int = box[2];
        return first + viaPointer + viaAliasPointer + viaGet;
      }
    `);

    expect(errors).toEqual([]);
  });
});
