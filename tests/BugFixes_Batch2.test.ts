import { describe, expect, it } from "bun:test";
import { Compiler } from "../compiler/index";

describe("Bug Fixes Batch 2", () => {
  const compiler = new Compiler({
    filePath: "test.bpl",
    collectAllErrors: true,
  });

  it("BUG-094: should reject generic instantiation with void", () => {
    const source = `
      struct Box<T> {
        value: T
      }
      frame main() {
        local b: Box<void>;
      }
    `;
    const result = compiler.compile(source);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some((e) => e.message.includes("cannot be 'void'")),
    ).toBe(true);
  });

  it("BUG-095: should reject generic array of void", () => {
    const source = `
      struct Arr<T> {
        data: T[]
      }
      frame main() {
        local a: Arr<void>;
      }
    `;
    const result = compiler.compile(source);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some((e) => e.message.includes("cannot be 'void'")),
    ).toBe(true);
  });

  it("should allow generic instantiation with *void", () => {
    const source = `
      struct Box<T> {
        value: T
      }
      frame main() {
        local b: Box<*void>;
        local x: *void = nullptr;
        # Use b to avoid unused variable error
        local y: *void = b.value;
        if (x == nullptr) { return; }
        if (y == nullptr) { return; }
      }
    `;
    const result = compiler.compile(source);
    if (!result.success) {
      console.log(
        "Errors:",
        result.errors?.map((e) => e.message),
      );
    }
    expect(result.success).toBe(true);
  });
});
