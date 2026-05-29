import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";

function generate(
  source: string,
  options: ConstructorParameters<typeof CodeGenerator>[0] = {},
) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const codeGenerator = new CodeGenerator(options);
  return codeGenerator.generate(program);
}

describe("CodeGen - Division By Zero", () => {
  it("should generate zero check for division", () => {
    const source = `
      frame main() {
        local a: i32 = 10;
        local b: i32 = 0;
        local x: i32 = a / b;
      }
    `;
    const ir = generate(source);

    expect(ir).toContain("icmp eq i32");
    expect(ir).toContain(", 0");
    expect(ir).toContain("br i1");
    // New codegen uses a runtime function call instead of inline error construction
    expect(ir).toContain("call void @__bpl_throw_division_by_zero");
  });

  it("should generate zero check for modulo", () => {
    const source = `
      frame main() {
        local a: i32 = 10;
        local b: i32 = 0;
        local x: i32 = a % b;
      }
    `;
    const ir = generate(source);

    // New codegen uses a runtime function call
    expect(ir).toContain("call void @__bpl_throw_division_by_zero");
  });

  it("should preserve zero checks for optimized builds", () => {
    const source = `
      frame main() {
        local a: i32 = 10;
        local b: i32 = 2;
        local x: i32 = a / b;
      }
    `;
    const ir = generate(source, { optimizationLevel: 3 });

    expect(ir).toContain("call void @__bpl_throw_division_by_zero");
    expect(ir).toContain("div_err");
  });

  it("should generate signed integer division overflow checks", () => {
    const source = `
      frame main() ret int {
        local min: int = -2147483648;
        local negativeOne: int = -1;
        return min / negativeOne;
      }
    `;
    const ir = generate(source, { optimizationLevel: 3 });

    expect(ir).toContain("icmp eq i32");
    expect(ir).toContain("-2147483648");
    expect(ir).toContain("call void @__bpl_throw_integer_overflow");
    expect(ir).toContain("div_overflow_err");
  });
});
