import { describe, expect, it } from "bun:test";
import { Compiler } from "../compiler/index";

function compile(source: string) {
  const compiler = new Compiler({
    filePath: "test.bpl",
    collectAllErrors: true,
  });
  return compiler.compile(source);
}

describe("Bug Fixes Batch 5", () => {
  it("BUG-133: should count constrained inline asm input operands as variable uses", () => {
    const source = `
      frame main() {
        local value: int = 10;
        local _result: int = 0;

        asm("intel") {
          mov eax, (value: "r")
          mov (=_result), eax
        }
      }
    `;

    const result = compile(source);
    expect(result.success).toBe(true);
  });

  it("BUG-133: should count constrained inline asm output operands as variable uses", () => {
    const source = `
      frame main() {
        local result: int = 0;

        asm("intel") {
          mov (=result: "={eax}"), eax
        }
      }
    `;

    const result = compile(source);
    expect(result.success).toBe(true);
  });

  it("BUG-133: should reject undefined inline asm operands with constraints", () => {
    const source = `
      frame main() {
        asm("intel") {
          mov (=missing: "={eax}"), eax
        }
      }
    `;

    const result = compile(source);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some((error) =>
        error.message.includes("Undefined variable 'missing' in asm block"),
      ),
    ).toBe(true);
  });
});
