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

function expectInvalidArraySizeError(source: string): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes("Array size must be greater than zero."),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe("BPL_ARRAY_SIZE_INVALID");
  expect(error?.hint).toContain("Arrays cannot have zero or negative size.");
  return error!;
}

describe("TypeChecker invalid array size diagnostics", () => {
  test("codes invalid fixed array sizes in type-bearing declarations", () => {
    const cases = [
      `
        frame main() ret int {
          local _values: int[0];
          return 0;
        }
      `,
      `
        frame takes(values: int[0]) ret void {
          return;
        }
      `,
      `
        struct Buffer {
          values: int[0],
        }
      `,
      `
        type EmptyInts = int[0];
      `,
    ];

    for (const source of cases) {
      expectInvalidArraySizeError(source);
    }
  });

  test("allows positive fixed array sizes and dynamic slices", () => {
    const source = `
      type Ints = int[4];

      struct Buffer {
        values: int[4],
        slice: int[],
      }

      frame takes(_values: int[4], _slice: int[]) ret void {
        local _localValues: int[4];
        return;
      }
    `;

    expect(collectErrors(source)).toEqual([]);
  });
});
