import { describe, expect, test } from "bun:test";

import { Compiler } from "../compiler";

function compileInvalid(source: string) {
  let result: ReturnType<Compiler["compile"]> | undefined;

  expect(() => {
    result = new Compiler({
      filePath: "internal-boundary.bpl",
      requireEntryPoint: false,
    }).compile(source);
  }).not.toThrow();

  expect(result).toBeDefined();
  expect(result!.success).toBe(false);
  const messages = (result!.errors ?? []).map((error) =>
    [error.message, error.hint].filter(Boolean).join("\n"),
  );
  expect(messages.length).toBeGreaterThan(0);
  for (const message of messages) {
    expect(message).not.toMatch(/internal compiler error/i);
  }
  return messages.join("\n");
}

describe("Internal compiler error boundaries", () => {
  test("rejects aggregate binary arithmetic before LLVM code generation", () => {
    const structErrors = compileInvalid(`
      struct Box {
        value: int,
      }

      frame badStruct() ret Box {
        local lhs: Box = Box { value: 1 };
        local rhs: Box = Box { value: 2 };
        return lhs + rhs;
      }
    `);
    expect(structErrors).toContain(
      "Operator '+' cannot be applied to types 'Box' and 'Box'",
    );

    const tupleErrors = compileInvalid(`
      frame badTuple() ret (int, int) {
        local lhs: (int, int) = (1, 2);
        local rhs: (int, int) = (3, 4);
        return lhs + rhs;
      }
    `);
    expect(tupleErrors).toContain(
      "Operator '+' cannot be applied to types '(i32, i32)' and '(i32, i32)'",
    );
  });

  test("rejects aggregate unary operators before LLVM code generation", () => {
    const errors = compileInvalid(`
      struct Box {
        value: int,
      }

      frame badUnary() ret Box {
        local value: Box = Box { value: 1 };
        return -value;
      }
    `);

    expect(errors).toContain(
      "Unary operator '-' cannot be applied to type 'Box'",
    );
  });
});
