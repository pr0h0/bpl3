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

  it("should use frameaddress stack-limit probes for optimized native non-tail recursion", () => {
    const source = `
      frame fib(n: int) ret int {
        if (n < 2) {
          return n;
        }
        return fib(n - 1) + fib(n - 2);
      }

      frame main() ret int {
        return fib(10);
      }
    `;
    const ir = generateOptimized(source);

    expect(ir).toContain("@__bpl_stack_limit = external global i8*");
    expect(ir).toContain("declare void @__bpl_throw_stack_overflow()");
    expect(ir).toContain("call i8* @llvm.frameaddress.p0i8(i32 0)");
    expect(ir).toContain("declare i8* @llvm.frameaddress.p0i8(i32)");
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

    const fibBody = ir.match(
      /define dso_local i32 @fib_i32[\s\S]*?\n}\n/,
    )?.[0];
    expect(fibBody).toBeDefined();
    expect(fibBody!).not.toContain("alloca i8");
    expect(fibBody!).not.toMatch(/br label %stack\.limit\.check/);
  });

  it("keeps alloca stack-limit probes for optimized native direct tail recursion", () => {
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
    const recurBody = ir.match(
      /define dso_local i32 @recur_i32[\s\S]*?\n}\n/,
    )?.[0];
    expect(recurBody).toBeDefined();
    expect(recurBody!).toContain("alloca i8");
    expect(recurBody!).not.toContain(
      "call i8* @llvm.frameaddress.p0i8(i32 0)",
    );
  });

  it("keeps alloca stack-limit probes for optimized native non-recursive functions", () => {
    const source = `
      frame sum(limit: int) ret int {
        local total: int = 0;
        local i: int = 0;
        loop (i < limit) {
          total = total + i;
          i = i + 1;
        }
        return total;
      }

      frame main() ret int {
        return sum(10);
      }
    `;
    const ir = generateOptimized(source);

    const sumBody = ir.match(
      /define dso_local i32 @sum_i32[\s\S]*?\n}\n/,
    )?.[0];
    expect(sumBody).toBeDefined();
    expect(sumBody!).toContain("alloca i8");
    expect(sumBody!).not.toContain(
      "call i8* @llvm.frameaddress.p0i8(i32 0)",
    );
  });

  it("omits optimized stack-limit probes for runtime-free main bodies", () => {
    const source = `
      extern printf(fmt: string, value: int);

      frame main() ret int {
        printf("hello %d\\n", 42);
        return 0;
      }
    `;
    const ir = generateOptimized(source);

    expect(ir).not.toContain("@__bpl_stack_limit = external global i8*");
    expect(ir).not.toContain("declare void @__bpl_throw_stack_overflow()");
    expect(ir).not.toContain("call void @__bpl_throw_stack_overflow()");
    expect(ir).not.toContain("alloca i8");
    expect(ir).toContain("call void @printf");
  });
});
