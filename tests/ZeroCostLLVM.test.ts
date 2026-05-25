import { describe, expect, it } from "bun:test";

import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function generate(source: string): string {
  const tokens = lexWithGrammar(source, "zero_cost_test.bpl");
  const parser = new Parser(source, "zero_cost_test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);

  const errors = typeChecker.getErrors();
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join("\n"));
  }

  const generator = new CodeGenerator();
  return generator.generate(program, "zero_cost_test.bpl");
}

function countMatches(input: string, pattern: RegExp): number {
  return [...input.matchAll(pattern)].length;
}

describe("Zero-Cost LLVM Shape Checks", () => {
  it("erases type aliases to their concrete LLVM types", () => {
    const ir = generate(`
      type UserId = i32;
      type Count = i32;

      frame addUsers(a: UserId, b: Count) ret UserId {
        return a + b;
      }
    `);

    expect(ir).not.toContain("UserId");
    expect(ir).not.toContain("Count");
    expect(ir).toContain("define i32 @addUsers_i32_i32");
    expect(ir).toContain("add i32");
  });

  it("does not emit runtime artifacts for nested aliases", () => {
    const ir = generate(`
      type Raw = i64;
      type Handle = Raw;
      type HandlePtr = *Handle;

      frame readHandle(handle: HandlePtr) ret Handle {
        return *handle;
      }
    `);

    expect(ir).not.toContain("HandlePtr");
    expect(ir).not.toContain("Handle =");
    expect(ir).toContain("define i64 @readHandle_i64_ptr");
    expect(ir).toContain("load i64");
  });

  it("monomorphizes a generic function once per concrete type", () => {
    const ir = generate(`
      frame id<T>(value: T) ret T {
        return value;
      }

      frame main() ret int {
        local a: int = id<int>(1);
        local b: int = id<int>(2);
        return a + b;
      }
    `);

    expect(countMatches(ir, /define i32 @id_i32_i32\b/g)).toBe(1);
    expect(ir).not.toContain("@id_T");
    expect(countMatches(ir, /call i32 @id_i32_i32/g)).toBe(2);
  });

  it("lowers tuple field access to LLVM aggregate extraction", () => {
    const ir = generate(`
      frame sumPair(pair: (int, int)) ret int {
        return pair.0 + pair.1;
      }
    `);

    expect(ir).toContain("extractvalue { i32, i32 }");
    expect(ir).not.toMatch(/call .*tuple/i);
    expect(ir).toContain("add i32");
  });

  it("lowers pointer indexing through aliases to direct getelementptr", () => {
    const ir = generate(`
      type IntPtr = *int;

      frame readAt(values: IntPtr, index: int) ret int {
        return values[index];
      }
    `);

    expect(ir).not.toContain("IntPtr");
    expect(ir).toMatch(/getelementptr inbounds i32|getelementptr i32/);
    expect(ir).not.toMatch(/call .*index/i);
  });

  it("does not emit duplicate generic struct bodies for repeated use", () => {
    const ir = generate(`
      struct Box<T> {
        value: T,
      }

      frame first(a: Box<int>, b: Box<int>) ret int {
        return a.value + b.value;
      }
    `);

    expect(countMatches(ir, /%struct\.Box_i32 = type/g)).toBe(1);
    expect(ir).not.toContain("Box<T>");
    expect(ir).toContain("getelementptr");
  });
});
