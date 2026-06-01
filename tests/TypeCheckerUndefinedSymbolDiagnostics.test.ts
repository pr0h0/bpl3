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

function expectUndefinedSymbolError(
  source: string,
  messagePart: string,
  hintPart: string,
): CompilerError {
  const error = collectErrors(source).find((candidate) =>
    candidate.message.includes(messagePart),
  );

  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(CompilerError);
  expect(error?.code).toBe("BPL_SYMBOL_NOT_FOUND");
  expect(error?.hint).toContain(hintPart);
  return error!;
}

describe("TypeChecker undefined symbol diagnostics", () => {
  test("codes undefined value identifiers", () => {
    expectUndefinedSymbolError(
      `
        frame main() ret int {
          return missingValue;
        }
      `,
      "Undefined symbol 'missingValue'",
      "Ensure the variable or function is declared before use.",
    );
  });

  test("codes missing callee identifiers", () => {
    expectUndefinedSymbolError(
      `
        frame main() ret int {
          return missingCall();
        }
      `,
      "Undefined symbol 'missingCall'",
      "Ensure the variable or function is declared before use.",
    );
  });

  test("keeps did-you-mean hints for similar symbols", () => {
    expectUndefinedSymbolError(
      `
        frame main() ret int {
          local totalCount: int = 1;
          return totalCoun;
        }
      `,
      "Undefined symbol 'totalCoun'",
      "Did you mean 'totalCount'?",
    );
  });

  test("preserves valid local, parameter, global, and function symbol resolution", () => {
    const errors = collectErrors(`
      import [String] from "std/string.bpl";

      global base: int = 1;

      frame add(value: int) ret int {
        return value + base;
      }

      struct Box {
        value: int,
        frame get(this: *Box) ret int {
          return this.value;
        }
      }

      frame main() ret int {
        local text: String = String.new("ok");
        local localValue: int = add(2);
        local box: Box = Box { value: localValue };
        return box.get() + text.length;
      }
    `);

    expect(errors).toEqual([]);
  });
});
