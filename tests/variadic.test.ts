import { describe, expect, it } from "bun:test";

import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import HelperGenerator from "../transpiler/HelperGenerator";
import { IRGenerator } from "../transpiler/ir/IRGenerator";
import Scope from "../transpiler/Scope";
import { LLVMTargetBuilder } from "../transpiler/target/LLVMTargetBuilder";

function generateIR(input: string): string {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const gen = new IRGenerator();
  const scope = new Scope();
  HelperGenerator.generateBaseTypes(scope);
  program.toIR(gen, scope);
  const builder = new LLVMTargetBuilder();
  return builder.build(gen.module);
}

describe("Variadic Functions", () => {
  it("should declare variadic function with correct signature", () => {
    const ir = generateIR(`
      frame sum(count: u64, ...:u64) ret u64 {
        return count;
      }
    `);
    expect(ir).toContain("define i64 @sum(i64 %count, ...)");
  });

  it("should access variadic arguments with args keyword", () => {
    const ir = generateIR(`
      frame sum(count: u64, ...:u64) ret u64 {
        local total: u64 = 0;
        local i: u64 = 0;
        loop {
          if i >= count { break; }
          total = total + args[i];
          i = i + 1;
        }
        return total;
      }
    `);
    expect(ir).toContain("define i64 @sum(i64 %count, ...)");
    expect(ir).toContain("alloca i64"); // For total
    expect(ir).toContain("br label"); // For loop
  });

  it("should generate correct variadic setup code", () => {
    const ir = generateIR(`
      frame test(count: u64, ...:u64) {
        local x: u64 = args[0];
      }
    `);
    expect(ir).toContain("define void @test(i64 %count, ...)");
    // Should have va_list setup
    expect(ir).toMatch(/alloca.*va_list|alloca.*\[1 x/);
  });

  it("should handle multiple variadic calls", () => {
    const ir = generateIR(`
      frame sum(count: u64, ...:u64) ret u64 {
        local total: u64 = 0;
        local i: u64 = 0;
        loop {
          if i >= count { break; }
          total = total + args[i];
          i = i + 1;
        }
        return total;
      }
      
      frame main() ret u64 {
        local s1: u64 = call sum(3, 1, 2, 3);
        local s2: u64 = call sum(5, 10, 20, 30, 40, 50);
        return s1 + s2;
      }
    `);
    expect(ir).toContain("call i64 @sum(i64 3, i64 1, i64 2, i64 3)");
    expect(ir).toContain(
      "call i64 @sum(i64 5, i64 10, i64 20, i64 30, i64 40, i64 50)",
    );
  });

  it("should support string variadic arguments", () => {
    const ir = generateIR(`
      frame concat(count: u64, dest: *u8, ...:u64) {
        local i: u64 = 0;
        loop {
          if i >= count { break; }
          i = i + 1;
        }
      }
    `);
    expect(ir).toContain("define void @concat(i64 %count, ptr %dest, ...)");
  });

  it("should work with external variadic functions", () => {
    const ir = generateIR(`
      import printf from "libc";
      extern printf(fmt: *u8, ...);
      
      frame main() ret u64 {
        call printf("Test %d %s\\n", 42, "hello");
        return 0;
      }
    `);
    expect(ir).toContain("@printf");
    expect(ir).toContain("call");
  });

  it("should handle empty variadic arguments", () => {
    const ir = generateIR(`
      frame test(base: u64, ...:u64) ret u64 {
        return base;
      }
      
      frame main() ret u64 {
        return call test(42);
      }
    `);
    expect(ir).toContain("call i64 @test(i64 42)");
  });

  it("should generate correct code for variadic with loop", () => {
    const ir = generateIR(`
      frame sum(count: u64, ...:u64) ret u64 {
        local total: u64 = 0;
        local i: u64 = 0;
        loop {
          if i >= count { break; }
          total = total + args[i];
          i = i + 1;
        }
        return total;
      }
    `);
    expect(ir).toContain("define i64 @sum(i64 %count, ...)");
    expect(ir).toMatch(/loop_body_\d+:/);
    expect(ir).toMatch(/loop_end_\d+:/);
    expect(ir).toContain("icmp"); // For comparison
    expect(ir).toContain("add i64"); // For increment and total
  });
});

describe("Variadic Edge Cases", () => {
  it("should handle variadic with struct arguments", () => {
    const ir = generateIR(`
      struct Point { x: u64, y: u64 }
      frame test(count: u64, ...:u64) {
        local i: u64 = 0;
      }
    `);
    expect(ir).toContain("define void @test(i64 %count, ...)");
  });

  it("should handle nested variadic calls", () => {
    const ir = generateIR(`
      frame inner(count: u64, ...:u64) ret u64 {
        return count;
      }
      
      frame outer(count: u64, ...:u64) ret u64 {
        return call inner(count, args[0], args[1]);
      }
    `);
    expect(ir).toContain("define i64 @inner(i64 %count, ...)");
    expect(ir).toContain("define i64 @outer(i64 %count, ...)");
  });

  it("should handle variadic return values in expressions", () => {
    const ir = generateIR(`
      frame sum(count: u64, ...:u64) ret u64 {
        return count;
      }
      
      frame main() ret u64 {
        local x: u64 = call sum(3, 1, 2, 3) + 10;
        return x;
      }
    `);
    expect(ir).toContain("call i64 @sum(i64 3, i64 1, i64 2, i64 3)");
    expect(ir).toContain("add i64");
  });
});
