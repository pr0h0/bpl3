import { describe, expect, it } from "bun:test";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return typeChecker.getErrors();
}

function expectSuccess(source: string) {
  try {
    const errors = check(source);
    if (errors.length > 0) {
      throw new Error(
        `Expected success, but got errors: ${errors.map((e) => e.message).join("\n")}`,
      );
    }
  } catch (e: any) {
    if (e instanceof CompilerError) {
      throw new Error(`Expected success, but got CompilerError: ${e.message}`);
    }
    throw e;
  }
}

function expectError(source: string, errorMsgFragment: string) {
  try {
    const errors = check(source);
    if (errors.length === 0) {
      throw new Error(
        `Expected error containing "${errorMsgFragment}", but got no errors.`,
      );
    }
    const combinedError = errors.map((e) => e.message).join("\n");
    if (!combinedError.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
      throw new Error(
        `Expected error containing "${errorMsgFragment}", but got: ${combinedError}`,
      );
    }
  } catch (e: any) {
    if (e instanceof CompilerError) {
      if (!e.message.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
        throw new Error(
          `Expected error containing "${errorMsgFragment}", but got: ${e.message}`,
        );
      }
      return; // Success
    }
    if (e.message.startsWith("Expected error")) {
      throw e;
    }
    if (e.message.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
      return;
    }
    throw new Error(`Unexpected error: ${e.message}`);
  }
}

describe("Pointer Edge Cases", () => {
  it("should allow indexing a pointer (dynamic array access)", () => {
    const source = `
      frame main() {
        local ptr: *i32 = nullptr;
        local _val: i32 = ptr[0];
      }
    `;
    expectSuccess(source);
  });

  it("should allow pointer arithmetic (addition)", () => {
    const source = `
      frame main() {
        local ptr: *i32 = nullptr;
        local _ptr2: *i32 = ptr + 1;
      }
    `;
    expectSuccess(source);
  });

  it("should allow pointer arithmetic (subtraction)", () => {
    const source = `
      frame main() {
        local ptr: *i32 = nullptr;
        local _ptr2: *i32 = ptr - 1;
      }
    `;
    expectSuccess(source);
  });

  it("should allow pointer difference", () => {
    const source = `
      frame main() {
        local ptr1: *i32 = nullptr;
        local ptr2: *i32 = nullptr;
        local _diff: i64 = ptr1 - ptr2;
      }
    `;
    expectSuccess(source);
  });

  it("should allow dereferencing a pointer", () => {
    const source = `
      frame main() {
        local ptr: *i32 = nullptr;
        local _val: i32 = *ptr;
      }
    `;
    expectSuccess(source);
  });

  it("should allow taking address of a variable", () => {
    const source = `
      frame main() {
        local x: i32 = 10;
        local _ptr: *i32 = &x;
      }
    `;
    expectSuccess(source);
  });

  it("should allow accessing struct field via pointer", () => {
    const source = `
      struct Point { x: i32, y: i32, }
      frame main() {
        local p: Point = Point { x: 1, y: 2 };
        local ptr: *Point = &p;
        local _x: i32 = ptr.x;
      }
    `;
    expectSuccess(source);
  });

  it("should allow explicit dereference and field access", () => {
    const source = `
      struct Point { x: i32, y: i32, }
      frame main() {
        local p: Point = Point { x: 1, y: 2 };
        local ptr: *Point = &p;
        local _x: i32 = (*ptr).x;
      }
    `;
    expectSuccess(source);
  });

  it("should allow indexing via type alias", () => {
    const source = `
      type IntPtr = *i32;
      frame main() {
        local ptr: IntPtr = nullptr;
        local _val: i32 = ptr[0];
      }
    `;
    expectSuccess(source);
  });

  it("should allow indexing generic pointer", () => {
    const source = `
      frame foo<T>(ptr: *T) {
        local _val: T = ptr[0];
      }
      frame main() {
        local ptr: *i32 = nullptr;
        foo<i32>(ptr);
      }
    `;
    expectSuccess(source);
  });

  it("should allow assigning to pointer index", () => {
    const source = `
      frame main() {
        local ptr: *i32 = nullptr;
        ptr[0] = 10;
      }
    `;
    expectSuccess(source);
  });

  it("should allow indexing pointer to pointer", () => {
    const source = `
      frame main() {
        local pptr: **i32 = nullptr;
        local _ptr: *i32 = pptr[0];
        local _val: i32 = pptr[0][0];
      }
    `;
    expectSuccess(source);
  });
});
