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

function expectAttributeError(
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

describe("TypeChecker function attribute diagnostics", () => {
  test("codes unknown duplicate and conflicting function attributes", () => {
    expectAttributeError(
      `
        @[trace]
        frame traced() {}
      `,
      "Unknown function attribute 'trace'",
      "BPL_FUNCTION_ATTRIBUTE_UNKNOWN",
      "Only compiler-known function attributes are supported.",
    );

    expectAttributeError(
      `
        @[inline, inline]
        frame duplicated() {}
      `,
      "Duplicate function attribute 'inline'",
      "BPL_FUNCTION_ATTRIBUTE_DUPLICATE",
      "Remove the duplicate attribute.",
    );

    expectAttributeError(
      `
        @[always_inline, noinline]
        frame conflicted() {}
      `,
      "Conflicting function attributes: always_inline, noinline",
      "BPL_FUNCTION_ATTRIBUTE_CONFLICT",
      "Remove one of the conflicting attributes.",
    );
  });

  test("codes noreturn return-type mismatches", () => {
    expectAttributeError(
      `
        @[noreturn]
        frame exits() ret int {
          return 1;
        }
      `,
      "Function attribute 'noreturn' requires a void return type",
      "BPL_FUNCTION_ATTRIBUTE_NORETURN_RETURN_TYPE_MISMATCH",
      "Use 'ret void' or remove the noreturn attribute.",
    );
  });

  test("codes invalid auto_destroy placement and method shape", () => {
    expectAttributeError(
      `
        @[auto_destroy]
        frame destroy() ret void {}
      `,
      "Function attribute 'auto_destroy' is only valid on destroy methods",
      "BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_CONTEXT_INVALID",
      "Move the attribute to a struct or enum method named 'destroy'.",
    );

    expectAttributeError(
      `
        struct Resource {
          @[auto_destroy]
          frame cleanup(this: *Resource) ret void {}
        }
      `,
      "Function attribute 'auto_destroy' requires method name 'destroy'",
      "BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_NAME_MISMATCH",
      "Rename the method to 'destroy' or remove the auto_destroy attribute.",
    );
  });

  test("codes invalid auto_destroy receivers", () => {
    expectAttributeError(
      `
        struct Resource {
          @[auto_destroy]
          frame destroy(resource: *Resource) ret void {}
        }
      `,
      "Function attribute 'auto_destroy' requires first parameter named 'this'",
      "BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RECEIVER_MISSING",
      "Use 'this: *Resource' as the first parameter.",
    );

    expectAttributeError(
      `
        struct Other {}

        struct Resource {
          @[auto_destroy]
          frame destroy(this: *Other) ret void {}
        }
      `,
      "Function attribute 'auto_destroy' requires receiver type '*Resource'",
      "BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RECEIVER_TYPE_MISMATCH",
      "Change the first parameter to 'this: *Resource'.",
    );
  });

  test("codes auto_destroy return-type mismatches", () => {
    expectAttributeError(
      `
        struct Resource {
          @[auto_destroy]
          frame destroy(this: *Resource) ret int {
            return 1;
          }
        }
      `,
      "Function attribute 'auto_destroy' requires a void return type",
      "BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RETURN_TYPE_MISMATCH",
      "Use 'ret void' or remove the auto_destroy attribute.",
    );
  });

  test("preserves valid function attributes", () => {
    const errors = collectErrors(`
      @[inline, cold]
      frame f() {}

      @[noreturn]
      frame exits() ret void {}

      struct Resource {
        @[auto_destroy]
        frame destroy(this: *Resource) ret void {}
      }
    `);

    expect(errors).toEqual([]);
  });
});
