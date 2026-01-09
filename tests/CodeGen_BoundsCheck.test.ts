import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";

function generate(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const codeGenerator = new CodeGenerator();
  return codeGenerator.generate(program);
}

describe("CodeGen - Bounds Check", () => {
  it("should generate bounds check for fixed-size array access", () => {
    const source = `
      frame main() {
        local arr: i32[10];
        local x: i32 = arr[5];
      }
    `;
    const ir = generate(source);

    // Check for bounds check logic
    expect(ir).toContain("icmp ult i64"); // Comparison
    expect(ir).toContain("br i1"); // Branch
    // New codegen uses a runtime function call instead of inline error construction
    expect(ir).toContain("call void @__bpl_throw_index_out_of_bounds");
  });
});
