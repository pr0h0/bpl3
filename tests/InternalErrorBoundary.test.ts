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

function compileValid(source: string) {
  const result = new Compiler({
    filePath: "internal-boundary.bpl",
    requireEntryPoint: false,
  }).compile(source);

  expect(result.success).toBe(true);
  expect(result.errors ?? []).toHaveLength(0);
  return result;
}

describe("Internal compiler error boundaries", () => {
  test("rejects executable statements at top level before code generation", () => {
    const loopErrors = compileInvalid(`
      loop frame main() ret int {
        return 0;
      }
    `);
    expect(loopErrors).toContain(
      "Statement 'Loop' is not allowed at the top level",
    );

    const returnErrors = compileInvalid("return 1;");
    expect(returnErrors).toContain(
      "Statement 'Return' is not allowed at the top level",
    );

    const ifErrors = compileInvalid("if (true) {}");
    expect(ifErrors).toContain("Statement 'If' is not allowed at the top level");
  });

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

  test("allows generic arithmetic bodies through aggregate arithmetic guard", () => {
    compileValid(`
      frame add<T>(a: T, b: T) ret T {
        return a + b;
      }

      frame main() ret int {
        return add<int>(10, 20);
      }
    `);
  });

  test("allows canonical bool arithmetic through aggregate arithmetic guard", () => {
    compileValid(`
      frame main() ret int {
        local lhs: bool = true;
        local rhs: bool = false;
        return lhs + rhs;
      }
    `);
  });
});
