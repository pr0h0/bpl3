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

function expectMemberAccessError(
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

describe("TypeChecker member access misuse diagnostics", () => {
  test("codes missing static members", () => {
    expectMemberAccessError(
      `
        struct S {
          x: int,
        }
        frame main() {
          local value: int = S.x;
        }
      `,
      "No static member 'x' found on type 'S'",
      "BPL_STATIC_MEMBER_NOT_FOUND",
      "Ensure the member is static (does not take 'this').",
    );
  });

  test("codes incompatible instance method access", () => {
    expectMemberAccessError(
      `
        struct S {
          frame staticFunc() {}
        }
        frame main() {
          local s: S;
          s.staticFunc();
        }
      `,
      "No compatible instance method 'staticFunc' found on type 'S'",
      "BPL_INSTANCE_METHOD_NOT_COMPATIBLE",
      "Static methods must be called on the type, not an instance.",
    );
  });

  test("codes invalid tuple indices", () => {
    expectMemberAccessError(
      `
        frame main() ret int {
          local pair: (int, bool) = (1, true);
          return pair.2;
        }
      `,
      "Invalid tuple index '2'",
      "BPL_TUPLE_INDEX_INVALID",
      "Valid indices are 0-1",
    );
  });

  test("codes missing members on concrete types", () => {
    expectMemberAccessError(
      `
        struct S {
          x: int,
        }
        frame main() ret int {
          local s: S;
          return s.y;
        }
      `,
      "Cannot access member 'y' on type 'S'",
      "BPL_MEMBER_NOT_FOUND",
      "Check the type definition for available members.",
    );
  });

  test("preserves valid field, instance method, static method, and tuple member access", () => {
    const errors = collectErrors(`
      struct Counter {
        value: int,
        frame make() ret Counter {
          return Counter { value: 1 };
        }
        frame inc(this: *Counter) ret int {
          return this.value + 1;
        }
      }

      frame main() ret int {
        local c: Counter = Counter.make();
        local value: int = c.value;
        local inc: int = c.inc();
        local pair: (int, bool) = (value, true);
        local first: int = pair.0;
        return first + inc;
      }
    `);

    expect(errors).toEqual([]);
  });
});
