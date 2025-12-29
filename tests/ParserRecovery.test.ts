import { describe, expect, it } from "bun:test";
import { Compiler } from "../compiler/index";
import { CompilerError } from "../compiler/common/CompilerError";

describe("Parser Error Recovery", () => {
  it("should collect multiple syntax errors", () => {
    const source = `
      frame foo() {
        invalid code;
        return;
      }
      
      frame bar() {
        also invalid;
      }
    `;

    const compiler = new Compiler({
      filePath: "test.bpl",
      collectAllErrors: true,
    });

    const result = compiler.compile(source);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThanOrEqual(2);
    expect(result.errors![0]!.message).toContain("Unexpected syntax");
    expect(result.errors![1]!.message).toContain("Unexpected syntax");
  });

  it("should stop at first error if collectAllErrors is false", () => {
    const source = `
      frame foo() {
        invalid code;
        return;
      }
    `;

    const compiler = new Compiler({
      filePath: "test.bpl",
      collectAllErrors: false,
    });

    const result = compiler.compile(source);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBe(1);
    expect(result.errors![0]!.message).toContain("Unexpected syntax");
  });
});
