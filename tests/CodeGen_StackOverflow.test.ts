import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";

function generateWithOptions(
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

function generate(source: string) {
  return generateWithOptions(source);
}

function generateOptimized(source: string) {
  return generateWithOptions(source, { optimizationLevel: 3 });
}

function functionBody(ir: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = ir.match(
    new RegExp(`define [^{]+ @${escapedName}[^\\n]*\\{[\\s\\S]*?\\n}\\n`),
  );
  expect(match).toBeDefined();
  return match![0];
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

  it("omits optimized stack-limit probes for call-free bounded helper bodies", () => {
    const source = `
      struct Pair {
        left: int,
        right: int,
      }

      frame helper(value: int) ret int {
        local pair: Pair = Pair { left: value + 1, right: value - 1 };
        if (pair.left > pair.right) {
          return pair.left - pair.right;
        }
        return pair.right - pair.left;
      }

      frame main() ret int {
        return helper(10);
      }
    `;
    const ir = generateOptimized(source);

    const helperBody = functionBody(ir, "helper_i32");
    expect(helperBody).not.toContain("alloca i8");
    expect(helperBody).not.toContain("load i8*, i8** @__bpl_stack_limit");
    expect(helperBody).not.toContain(
      "call i8* @llvm.frameaddress.p0i8(i32 0)",
    );
    expect(helperBody).not.toContain("call void @__bpl_throw_stack_overflow()");

    const mainBody = functionBody(ir, "main");
    expect(mainBody).toContain("load i8*, i8** @__bpl_stack_limit");
    expect(mainBody).toContain("call void @__bpl_throw_stack_overflow()");
  });

  it("keeps optimized stack-limit probes for non-recursive functions with calls", () => {
    const source = `
      frame leaf(value: int) ret int {
        return value + 1;
      }

      frame wrapper(value: int) ret int {
        local next: int = leaf(value);
        return next + 1;
      }

      frame main() ret int {
        return wrapper(10);
      }
    `;
    const ir = generateOptimized(source);

    const wrapperBody = functionBody(ir, "wrapper_i32");
    expect(wrapperBody).toContain("alloca i8");
    expect(wrapperBody).toContain("load i8*, i8** @__bpl_stack_limit");
    expect(wrapperBody).toContain("call void @__bpl_throw_stack_overflow()");
  });

  it("omits default stack depth hooks for runtime-check-free bounded helper bodies", () => {
    const source = `
      frame helper(value: int) ret int {
        if (value > 0) {
          return value;
        }
        return 0 - value;
      }

      frame main() ret int {
        return helper(10);
      }
    `;
    const ir = generate(source);

    const helperBody = functionBody(ir, "helper_i32");
    expect(helperBody).not.toContain("call void @__bpl_enter_stack_frame()");
    expect(helperBody).not.toContain("call void @__bpl_exit_stack_frame()");

    const mainBody = functionBody(ir, "main");
    expect(mainBody).toContain("call void @__bpl_enter_stack_frame()");
    expect(mainBody).toContain("call void @__bpl_exit_stack_frame()");
  });

  it("keeps default stack depth hooks for bounded helpers with checked runtime failures", () => {
    const source = `
      frame helper(value: int) ret int {
        return 10 / value;
      }

      frame main() ret int {
        return helper(2);
      }
    `;
    const ir = generate(source);

    const helperBody = functionBody(ir, "helper_i32");
    expect(helperBody).toContain("call void @__bpl_enter_stack_frame()");
    expect(helperBody).toContain("call void @__bpl_exit_stack_frame()");
    expect(helperBody).toContain("call void @__bpl_throw_division_by_zero");
  });

  it("keeps wasm stack depth hooks for runtime-check-free bounded helper bodies", () => {
    const source = `
      frame helper(value: int) ret int {
        if (value > 0) {
          return value;
        }
        return 0 - value;
      }

      frame main() ret int {
        return helper(10);
      }
    `;
    const ir = generateWithOptions(source, {
      optimizationLevel: 3,
      target: "wasm32-unknown-unknown",
    });

    const helperBody = functionBody(ir, "helper_i32");
    expect(helperBody).toContain("call void @__bpl_enter_stack_frame()");
    expect(helperBody).toContain("call void @__bpl_exit_stack_frame()");
  });

  it("keeps DWARF stack depth hooks for runtime-check-free bounded helper bodies", () => {
    const source = `
      frame helper(value: int) ret int {
        if (value > 0) {
          return value;
        }
        return 0 - value;
      }

      frame main() ret int {
        return helper(10);
      }
    `;
    const ir = generateWithOptions(source, { dwarf: true });

    const helperBody = functionBody(ir, "helper_i32");
    expect(helperBody).toContain("call void @__bpl_enter_stack_frame()");
    expect(helperBody).toContain("call void @__bpl_exit_stack_frame()");
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
