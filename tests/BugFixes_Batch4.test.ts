import { describe, it, expect } from "bun:test";
import { Compiler } from "../compiler/index";

function compileToIR(code: string): string {
  const compiler = new Compiler({
    filePath: "test.bpl",
    emitType: "llvm",
  });
  const result = compiler.compile(code);
  if (!result.success) {
    if (result.errors && result.errors.length > 0) {
      throw result.errors[0];
    }
    throw new Error("Compilation failed without errors");
  }
  return result.output || "";
}

describe("BugFixes Batch 4", () => {
  it("BUG-097: Array of function types should allocate correct size", () => {
    const code = `
      type FuncType = Func<void>();
      
      frame main() {
        local _arr: FuncType[10];
        # sizeof(arr) should be 10 * sizeof(FuncType)
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
    const ir = compileToIR(code);
    // Check if the alloca instruction allocates an array of 10 elements
    // It should look something like: %arr = alloca [10 x void ()*], align 8
    // Or if FuncType is a struct (closure), it might be different.

    // Let's check the IR for the array type.
    expect(ir).toMatch(/alloca \[10 x/);
  });

  it("BUG-099: Generic function type aliases substitution", () => {
    const code = `
      type Callback<MyGenericT> = Func<void>(MyGenericT);
      
      frame my_callback(_x: int) {
      }

      frame main() {
        local _cb: Callback<int> = my_callback;
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
    const ir = compileToIR(code);
    expect(ir).not.toContain("%struct.MyGenericT"); // Should not contain unsubstituted T
  });

  it("BUG-100: Generic struct type aliases argument count check", () => {
    const code = `
      struct Box<T> {
        val: T
      }
      
      type B<T> = Box<T>;
      
      frame main() {
        local b: B<int>;
        b.val = 10;
      }
    `;
    expect(() => compileToIR(code)).not.toThrow();
  });
});
