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

describe("Pointer Operations", () => {
  it("should create pointer variable", () => {
    const ir = generateIR(`
      frame test() {
        local x: u64 = 10;
        local p: *u64 = &x;
      }
    `);
    expect(ir).toContain("alloca i64");
    expect(ir).toContain("alloca ptr");
    expect(ir).toContain("store ptr");
  });

  it("should dereference pointer", () => {
    const ir = generateIR(`
      frame test() {
        local x: u64 = 10;
        local p: *u64 = &x;
        local y: u64 = *p;
      }
    `);
    expect(ir).toContain("load i64, ptr");
  });

  it("should modify value through pointer", () => {
    const ir = generateIR(`
      frame test() {
        local x: u64 = 10;
        local p: *u64 = &x;
        *p = 20;
      }
    `);
    expect(ir).toContain("store i64 20");
  });

  it("should handle NULL pointer", () => {
    const ir = generateIR(`
      frame test() {
        local p: *u64 = NULL;
      }
    `);
    expect(ir).toContain("store ptr null");
  });

  it("should compare pointers", () => {
    const ir = generateIR(`
      frame test() {
        local p1: *u64 = NULL;
        local p2: *u64 = NULL;
        local eq: u8 = p1 == p2;
        local ne: u8 = p1 != p2;
      }
    `);
    expect(ir).toContain("icmp eq ptr");
    expect(ir).toContain("icmp ne ptr");
  });

  it("should handle pointer to struct", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame test() {
        local p: Point;
        local ptr: *Point = &p;
      }
    `);
    expect(ir).toContain("alloca %Point");
    expect(ir).toContain("alloca ptr");
  });

  it("should handle double pointer", () => {
    const ir = generateIR(`
      frame test() {
        local x: u64 = 10;
        local p: *u64 = &x;
        local pp: **u64 = &p;
      }
    `);
    expect(ir).toContain("alloca i64");
    expect(ir).toContain("alloca ptr");
  });

  it("should handle pointer arithmetic", () => {
    const ir = generateIR(`
      frame test() {
        local arr: u64[10];
        local p: *u64 = &arr;
        local p2: *u64 = p + 1;
      }
    `);
    expect(ir).toContain("getelementptr");
  });

  it("should handle pointer in function parameter", () => {
    const ir = generateIR(`
      frame modify(p: *u64) {
        *p = 42;
      }
    `);
    expect(ir).toContain("define void @modify(ptr %p)");
    expect(ir).toContain("store i64 42");
  });

  it("should handle pointer return type", () => {
    const ir = generateIR(`
      frame get_ptr() ret *u64 {
        local x: u64 = 10;
        return &x;
      }
    `);
    expect(ir).toContain("define ptr @get_ptr()");
    expect(ir).toContain("ret ptr");
  });

  it("should handle array decay to pointer", () => {
    const ir = generateIR(`
      frame test() {
        local arr: u64[5];
        local p: *u64 = arr;
      }
    `);
    expect(ir).toContain("alloca [5 x i64]");
    expect(ir).toContain("getelementptr [5 x i64]");
  });
});

describe("Pointer Edge Cases", () => {
  it("should handle void pointer", () => {
    const ir = generateIR(`
      import malloc from "libc";
      extern malloc(size: u64) ret *u8;
      
      frame test() {
        local p: *u8 = call malloc(100);
      }
    `);
    expect(ir).toContain("alloca ptr");
    expect(ir).toContain("call ptr @malloc");
  });

  it("should handle pointer to pointer assignment", () => {
    const ir = generateIR(`
      frame test() {
        local x: u64 = 10;
        local p1: *u64 = &x;
        local p2: *u64 = p1;
      }
    `);
    expect(ir).toContain("load ptr");
    expect(ir).toContain("store ptr");
  });

  it("should handle conditional pointer operations", () => {
    const ir = generateIR(`
      frame test() {
        local x: u64 = 10;
        local p: *u64 = &x;
        if p != NULL {
          *p = 20;
        }
      }
    `);
    expect(ir).toContain("icmp ne ptr");
    expect(ir).toContain("br i1");
  });

  it("should handle pointer in struct", () => {
    const ir = generateIR(`
      struct Node {
        value: u64,
        next: *Node
      }
      
      frame test() {
        local n: Node;
        n.next = NULL;
      }
    `);
    expect(ir).toContain("%Node = type { i64, ptr }");
    expect(ir).toContain("store ptr null");
  });

  it("should handle multiple pointer levels", () => {
    const ir = generateIR(`
      frame test() {
        local x: u64 = 10;
        local p1: *u64 = &x;
        local p2: **u64 = &p1;
        local p3: ***u64 = &p2;
      }
    `);
    expect(ir).toContain("alloca i64");
    expect(ir).toContain("alloca ptr");
  });

  it("should handle pointer comparison with NULL", () => {
    const ir = generateIR(`
      frame test() ret u8 {
        local p: *u64 = NULL;
        if p == NULL {
          return 1;
        }
        return 0;
      }
    `);
    expect(ir).toContain("icmp eq ptr");
    expect(ir).toContain("ret i8");
  });

  it("should handle function pointer simulation", () => {
    const ir = generateIR(`
      frame callback(value: u64) ret u64 {
        return value * 2;
      }
      
      frame test() ret u64 {
        return call callback(5);
      }
    `);
    expect(ir).toContain("call i64 @callback(i64 5)");
  });

  it("should handle pointer to array element", () => {
    const ir = generateIR(`
      frame test() {
        local arr: u64[10];
        local p: *u64 = &arr[5];
      }
    `);
    expect(ir).toContain("getelementptr [10 x i64]");
  });

  it("should handle struct member pointer", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame test() {
        local p: Point;
        local px: *u64 = &p.x;
        *px = 10;
      }
    `);
    expect(ir).toContain("getelementptr %Point");
    expect(ir).toContain("store i64 10");
  });

  it("should handle pointer in global scope", () => {
    const ir = generateIR(`
      global x: u64 = 10;
      global p: *u64;
      
      frame test() {
        p = &x;
      }
    `);
    expect(ir).toContain("@x = global i64 10");
    expect(ir).toContain("@p = global ptr");
  });
});

describe("Memory Operations", () => {
  it("should handle dynamic allocation", () => {
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
    expect(ir).toContain("call");
    expect(ir).toContain("@free");
  });

  it("should handle pointer arithmetic with offset", () => {
    const ir = generateIR(`
      frame test() {
        local base: *u8 = NULL;
        local offset: u64 = 10;
        local ptr: *u8 = base + offset;
      }
    `);
    expect(ir).toContain("getelementptr i8");
  });

  it("should handle casting between pointer types", () => {
    const ir = generateIR(`
      frame test() {
        local p1: *u8 = NULL;
        local p2: *u64 = p1;
      }
    `);
    expect(ir).toContain("alloca ptr");
    expect(ir).toContain("store ptr");
  });
});
