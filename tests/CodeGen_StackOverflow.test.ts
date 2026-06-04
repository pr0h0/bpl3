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

function generateOptimized(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const codeGenerator = new CodeGenerator({ optimizationLevel: 3 });
  return codeGenerator.generate(program);
}

describe("CodeGen - Stack Overflow", () => {
  it("should generate stack depth check", () => {
    const source = `
      frame main() {
        return;
      }
    `;
    const ir = generate(source);

    // Check for runtime calls
    expect(ir).toContain("call void @__bpl_enter_stack_frame()");
    expect(ir).toContain("call void @__bpl_exit_stack_frame()");
  });

  it("should use stack-limit probes for optimized native builds", () => {
    const source = `
      frame recur(n: int) ret int {
        return recur(n + 1);
      }

      frame main() ret int {
        return recur(0);
      }
    `;
    const ir = generateOptimized(source);

    expect(ir).toContain("@__bpl_stack_limit = external global i8*");
    expect(ir).toContain("declare void @__bpl_throw_stack_overflow()");
    expect(ir).toContain("alloca i8");
    expect(ir).toContain("load i8*, i8** @__bpl_stack_limit");
    expect(ir).toContain("store i8*");
    expect(ir).toContain("i8** @__bpl_stack_limit");
    expect(ir).toContain("getelementptr i8, i8*");
    expect(ir).toContain("icmp ult i8*");
    expect(ir).toContain("call void @__bpl_throw_stack_overflow()");
    expect(ir).not.toContain("@__bpl_stack_depth = external global i32");
    expect(ir).not.toContain("@__bpl_stack_base = external global i8*");
    expect(ir).not.toContain("call void @__bpl_enter_stack_frame()");
    expect(ir).not.toContain("call void @__bpl_exit_stack_frame()");

    const recurBody = ir.match(
      /define dso_local i32 @recur_i32[\s\S]*?\n}\n/,
    )?.[0];
    expect(recurBody).toBeDefined();
    expect(recurBody!).not.toMatch(/br label %stack\.limit\.check/);
  });
});
