import { describe, expect, it } from "bun:test";
import { Compiler } from "../compiler/index";

describe("Bug Fixes Batch 1", () => {
  const compiler = new Compiler({
    filePath: "test.bpl",
    collectAllErrors: true,
  });

  it("BUG-056: should reject duplicate enum variants", () => {
    const source = `
      enum Color {
        Red,
        Green,
        Red # Duplicate
      }
    `;
    const result = compiler.compile(source);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some((e) => e.message.includes("Duplicate enum variant")),
    ).toBe(true);
  });

  it("BUG-059: should reject void as function argument", () => {
    const source = `
      frame foo(x: void) { }
    `;
    const result = compiler.compile(source);
    expect(result.success).toBe(false);
    const hasError = result.errors?.some((e) =>
      e.message.includes("cannot be of type 'void'"),
    );
    expect(hasError).toBe(true);
  });

  it("BUG-060: should reject array of void", () => {
    const source = `
      frame foo() {
        local arr: void[10];
      }
    `;
    const result = compiler.compile(source);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some((e) => e.message.includes("cannot be void")),
    ).toBe(true);
  });

  it("BUG-093: should reject struct field of type void", () => {
    const source = `
      struct Container {
        data: void
      }
    `;
    const result = compiler.compile(source);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some((e) => e.message.includes("cannot be void")),
    ).toBe(true);
  });

  it("should allow *void pointers", () => {
    const source = `
      struct Container {
        data: *void
      }
      frame foo(x: *void) {
        local arr: *void[10];
        local y: *void = x;
        local z: *void = arr[0];
        # Use variables to avoid unused variable error
        if (y == nullptr) { return; }
        if (z == nullptr) { return; }
      }
    `;
    const result = compiler.compile(source);
    expect(result.success).toBe(true);
  });
});
