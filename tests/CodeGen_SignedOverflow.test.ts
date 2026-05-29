import { describe, expect, it } from "bun:test";

import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function generateOptimized(source: string): string {
  const tokens = lexWithGrammar(source, "signed_overflow_test.bpl");
  const parser = new Parser(source, "signed_overflow_test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const codeGenerator = new CodeGenerator({ optimizationLevel: 3 });
  return codeGenerator.generate(program);
}

describe("CodeGen - Signed Overflow Semantics", () => {
  it("does not mark ordinary signed arithmetic as no-signed-wrap", () => {
    const ir = generateOptimized(`
      frame main() ret int {
        local max: int = 2147483647;
        local min: int = -2147483648;
        local addWrapped: int = max + 1;
        local subWrapped: int = min - 1;
        local mulWrapped: int = max * 2;
        return addWrapped + subWrapped + mulWrapped;
      }
    `);

    expect(ir).toContain(" add i32 ");
    expect(ir).toContain(" sub i32 ");
    expect(ir).toContain(" mul i32 ");
    expect(ir).not.toContain("add nsw");
    expect(ir).not.toContain("sub nsw");
    expect(ir).not.toContain("mul nsw");
  });
});
