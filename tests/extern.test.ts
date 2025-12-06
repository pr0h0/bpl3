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

describe("Extern Declarations", () => {
  it("should generate extern declaration without parameters", () => {
    const ir = generateIR(`
      import test_func from "libc";
      extern test_func();
    `);
    expect(ir).toMatch(/declare.*@test_func\(\)/);
  });

  it("should generate extern declaration with parameters", () => {
    const ir = generateIR(`
      import printf from "libc";
      extern printf(fmt: *u8, ...);
    `);
    // Extern doesn't change the IR signature, just validates usage
    expect(ir).toContain("declare");
    expect(ir).toContain("@printf");
  });

  it("should generate extern with return type", () => {
    const ir = generateIR(`
      import malloc from "libc";
      extern malloc(size: u64) ret *u8;
    `);
    // Extern provides type info but doesn't change default IR signature
    expect(ir).toContain("declare");
    expect(ir).toContain("@malloc");
  });

  it("should allow calling extern function", () => {
    const ir = generateIR(`
      import printf from "libc";
      extern printf(fmt: *u8, ...);
      
      frame main() ret u64 {
        call printf("Hello %d\\n", 42);
        return 0;
      }
    `);
    expect(ir).toContain("call");
    expect(ir).toContain("@printf");
  });

  it("should handle multiple extern declarations", () => {
    const ir = generateIR(`
      import malloc, free from "libc";
      extern malloc(size: u64) ret *u8;
      extern free(ptr: *u8);
      
      frame test() {
        local ptr: *u8 = call malloc(100);
        call free(ptr);
      }
    `);
    expect(ir).toContain("call ptr @malloc(i64 100)");
    expect(ir).toContain("@free");
  });

  it("should handle extern with various types", () => {
    const ir = generateIR(`
      import test from "libc";
      extern test(a: u8, b: u16, c: u32, d: u64) ret i64;
    `);
    expect(ir).toContain("declare");
    expect(ir).toContain("@test");
  });

  it("should handle extern with pointer types", () => {
    const ir = generateIR(`
      import getenv from "libc";
      extern getenv(name: *u8) ret *u8;
      
      frame main() ret u64 {
        local path: *u8 = call getenv("PATH");
        return 0;
      }
    `);
    expect(ir).toContain("@getenv");
  });

  it("should handle extern with float types", () => {
    const ir = generateIR(`
      import sin from "libc";
      extern sin(x: f64) ret f64;
      
      frame test() {
        local result: f64 = call sin(3.14);
      }
    `);
    expect(ir).toContain("@sin");
    expect(ir).toContain("call double @sin(double 3.14)");
  });

  it("should override import signature with extern", () => {
    const ir = generateIR(`
      import custom_func;
      extern custom_func(x: u64, y: u64) ret u64;
      
      frame test() ret u64 {
        return call custom_func(10, 20);
      }
    `);
    expect(ir).toContain("@custom_func");
    expect(ir).toContain("call i64 @custom_func(i64 10, i64 20)");
  });
});

describe("Extern Edge Cases", () => {
  it("should handle extern with no arguments but with return", () => {
    const ir = generateIR(`
      import getpid from "libc";
      extern getpid() ret u32;
    `);
    expect(ir).toContain("@getpid");
  });

  it("should handle extern before import", () => {
    const ir = generateIR(`
      extern test(x: u64);
      import test;
      
      frame main() {
        call test(42);
      }
    `);
    expect(ir).toMatch(/declare.*@test\(i64/);
  });

  it("should handle extern with struct parameters", () => {
    const ir = generateIR(`
      struct Point { x: u64, y: u64 }
      import process from "libc";
      extern process(p: Point) ret u64;
    `);
    expect(ir).toContain("@process");
  });

  it("should handle extern with array pointers", () => {
    const ir = generateIR(`
      import sort from "libc";
      extern sort(arr: *u64, len: u64);
    `);
    expect(ir).toContain("@sort");
  });

  it("should handle variadic extern correctly", () => {
    const ir = generateIR(`
      import printf from "libc";
      extern printf(fmt: *u8, ...);
      
      frame test() {
        call printf("Int: %d, Float: %f, String: %s\\n", 42, 3.14, "hello");
      }
    `);
    expect(ir).toContain("@printf");
    expect(ir).toContain("call");
  });

  it("should work without extern for imported functions", () => {
    const ir = generateIR(`
      import unknown_func;
      
      frame test() {
        call unknown_func();
      }
    `);
    // Should have a default signature
    expect(ir).toMatch(/declare.*@unknown_func/);
  });

  it("should handle multiple parameters of same type", () => {
    const ir = generateIR(`
      import add3 from "libc";
      extern add3(a: u64, b: u64, c: u64) ret u64;
    `);
    expect(ir).toContain("@add3");
  });

  it("should handle extern with void return explicitly", () => {
    const ir = generateIR(`
      import cleanup from "libc";
      extern cleanup(code: u64);
      
      frame test() {
        call cleanup(0);
      }
    `);
    expect(ir).toContain("@cleanup");
    expect(ir).toContain("call void @cleanup(i64 0)");
  });
});

describe("Common C Library Functions", () => {
  it("should handle printf correctly", () => {
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

  it("should handle malloc and free", () => {
    const ir = generateIR(`
      import malloc, free from "libc";
      extern malloc(size: u64) ret *u8;
      extern free(ptr: *u8);
      
      frame test() {
        local ptr: *u8 = call malloc(100);
        call free(ptr);
      }
    `);
    expect(ir).toContain("call ptr @malloc(i64 100)");
    expect(ir).toContain("@free");
  });

  it("should handle memcpy", () => {
    const ir = generateIR(`
      import memcpy from "libc";
      extern memcpy(dest: *u8, src: *u8, n: u64) ret *u8;
    `);
    expect(ir).toContain("@memcpy");
  });

  it("should handle strlen", () => {
    const ir = generateIR(`
      import strlen from "libc";
      extern strlen(s: *u8) ret u64;
      
      frame test() ret u64 {
        return call strlen("hello");
      }
    `);
    expect(ir).toContain("@strlen");
    expect(ir).toContain("call i64 @strlen(ptr");
  });
});
