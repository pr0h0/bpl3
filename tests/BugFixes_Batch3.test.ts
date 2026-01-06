import { describe, expect, it } from "bun:test";
import { Compiler } from "../compiler/index";

describe("Bug Fixes Batch 3", () => {
  const compiler = new Compiler({
    filePath: "test.bpl",
    collectAllErrors: true,
  });

  it("BUG-096: should support parentheses in type declarations", () => {
    const source = `
      frame main() {
        local _x: (*int)[10];
      }
    `;
    const result = compiler.compile(source);
    if (!result.success) {
      console.error(result.errors);
    }
    expect(result.success).toBe(true);
  });

  it("BUG-098: should support array of tuples", () => {
    const source = `
      frame main() {
        local _x: (int, int)[10];
        local _y: (int, int) = _x[0];
      }
    `;
    const result = compiler.compile(source);
    if (!result.success) {
      console.error(result.errors);
    }
    expect(result.success).toBe(true);
  });

  it("BUG-085: should support sizeof<int[10]>()", () => {
    const source = `
      import [Int] from "std/primitives.bpl";
      frame main() {
        local _s: u64 = sizeof<int[10]>();
      }
    `;
    const result = compiler.compile(source);
    if (!result.success) {
      console.error(result.errors);
    }
    expect(result.success).toBe(true);
  });
});
