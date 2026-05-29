import { describe, expect, it } from "bun:test";

import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function generateIr(source: string): string {
  const tokens = lexWithGrammar(source, "raw_pointer_inbounds_test.bpl");
  const parser = new Parser(source, "raw_pointer_inbounds_test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const codeGenerator = new CodeGenerator();
  return codeGenerator.generate(program);
}

describe("CodeGen - Raw Pointer Inbounds Semantics", () => {
  it("does not mark unchecked raw pointer arithmetic as inbounds", () => {
    const ir = [
      generateIr(`
      frame addPtr(ptr: *int) ret *int {
        return ptr + 1;
      }
    `),
      generateIr(`
      frame subPtr(ptr: *int) ret *int {
        return ptr - 2;
      }
    `),
    ].join("\n");

    expect(ir).toMatch(/getelementptr i32, i32\* %[^,]+, i64 %/);
    expect(ir).not.toMatch(/getelementptr inbounds i32, i32\* %[^,]+, i64 %/);
  });

  it("does not mark unchecked raw pointer indexing as inbounds", () => {
    const ir = generateIr(`
      frame readPtr(ptr: *int, offset: int) ret int {
        return ptr[offset];
      }

      frame writePtr(ptr: *int, offset: int) ret void {
        ptr[offset] = 17;
      }
    `);

    expect(ir).toMatch(/getelementptr i32, i32\* %[^,]+, i64 %/);
    expect(ir).not.toMatch(/getelementptr inbounds i32, i32\* %[^,]+, i64 %/);
  });

  it("does not mark unchecked pointer-to-array row arithmetic as inbounds", () => {
    const ir = generateIr(`
      type IntArray = int[3];

      frame readCell(rows: *IntArray, row: int, col: int) ret int {
        return (*(rows + row))[col];
      }
    `);

    expect(ir).toMatch(
      /getelementptr \[3 x i32\], \[3 x i32\]\* %[^,]+, i64 %/,
    );
    expect(ir).not.toMatch(
      /getelementptr inbounds \[3 x i32\], \[3 x i32\]\* %[^,]+, i64 %/,
    );
  });
});
