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

describe("Struct Features", () => {
  it("should pass struct by value", () => {
    const ir = generateIR(`
      struct Vector3 {
        x: u64,
        y: u64,
        z: u64
      }
      
      frame modify(v: Vector3) {
        v.x = 999;
      }
    `);
    expect(ir).toContain("%Vector3 = type { i64, i64, i64 }");
    expect(ir).toContain("define void @modify(%Vector3 %v)");
  });

  it("should return struct by value", () => {
    const ir = generateIR(`
      struct Vector3 {
        x: u64,
        y: u64,
        z: u64
      }
      
      frame create(x: u64, y: u64, z: u64) ret Vector3 {
        local v: Vector3;
        v.x = x;
        v.y = y;
        v.z = z;
        return v;
      }
    `);
    expect(ir).toContain("define %Vector3 @create(i64 %x, i64 %y, i64 %z)");
    expect(ir).toContain("ret %Vector3");
  });

  it("should handle struct member access", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame test() {
        local p: Point;
        p.x = 10;
        p.y = 20;
        local x_val: u64 = p.x;
      }
    `);
    expect(ir).toContain("getelementptr %Point");
    expect(ir).toContain("store i64 10");
    expect(ir).toContain("store i64 20");
  });

  it("should handle nested structs", () => {
    const ir = generateIR(`
      struct Inner {
        value: u64
      }
      
      struct Outer {
        inner: Inner,
        count: u64
      }
      
      frame test() {
        local o: Outer;
        o.inner.value = 42;
        o.count = 10;
      }
    `);
    expect(ir).toContain("%Inner = type { i64 }");
    expect(ir).toContain("%Outer = type { %Inner, i64 }");
    expect(ir).toContain("getelementptr %Outer");
    expect(ir).toContain("getelementptr %Inner");
  });

  it("should handle struct arrays", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame test() {
        local points: Point[3];
        points[0].x = 1;
        points[1].y = 2;
      }
    `);
    expect(ir).toContain("alloca [3 x %Point]");
    expect(ir).toContain("getelementptr [3 x %Point]");
  });

  it("should handle struct pointers", () => {
    const ir = generateIR(`
      struct Node {
        value: u64,
        next: *Node
      }
      
      frame test() {
        local n: Node;
        n.value = 10;
        n.next = NULL;
      }
    `);
    expect(ir).toContain("%Node = type { i64, ptr }");
    expect(ir).toContain("store ptr null");
  });

  it("should handle struct initialization in function call", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame print_point(p: Point) {
        local x: u64 = p.x;
      }
      
      frame test() {
        local p: Point;
        p.x = 10;
        p.y = 20;
        call print_point(p);
      }
    `);
    expect(ir).toContain("call void @print_point(%Point");
  });

  it("should handle struct comparison operations", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame test() {
        local p1: Point;
        local p2: Point;
        p1.x = 10;
        p2.x = 20;
        local result: u8 = p1.x == p2.x;
      }
    `);
    expect(ir).toContain("icmp eq i64");
  });

  it("should handle struct with float members", () => {
    const ir = generateIR(`
      struct Vector3f {
        x: f32,
        y: f32,
        z: f32
      }
      
      frame test() {
        local v: Vector3f;
        v.x = 1.0;
        v.y = 2.0;
        v.z = 3.0;
      }
    `);
    expect(ir).toContain("%Vector3f = type { float, float, float }");
    expect(ir).toContain("store float");
  });

  it("should handle struct assignment", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame test() {
        local p1: Point;
        p1.x = 10;
        p1.y = 20;
        local p2: Point;
        p2 = p1;
      }
    `);
    expect(ir).toContain("alloca %Point");
    // Assignment should involve load and store
    expect(ir).toContain("load %Point");
    expect(ir).toContain("store %Point");
  });

  it("should handle struct with array members", () => {
    const ir = generateIR(`
      struct Data {
        values: u64[10]
      }
      
      frame test() {
        local d: Data;
        d.values[0] = 42;
      }
    `);
    expect(ir).toContain("%Data = type { [10 x i64] }");
    expect(ir).toContain("getelementptr %Data");
  });
});

describe("Struct Edge Cases", () => {
  it("should handle empty struct block", () => {
    const ir = generateIR(`
      struct Empty {}
      
      frame test() {
        local e: Empty;
      }
    `);
    expect(ir).toContain("%Empty = type {");
  });

  it("should handle struct with single member", () => {
    const ir = generateIR(`
      struct Wrapper {
        value: u64
      }
      
      frame test() {
        local w: Wrapper;
        w.value = 42;
      }
    `);
    expect(ir).toContain("%Wrapper = type { i64 }");
  });

  it("should handle struct in global scope", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      global origin: Point;
    `);
    expect(ir).toContain("%Point = type { i64, i64 }");
    expect(ir).toContain("@origin = global %Point");
  });

  it("should handle multiple struct types", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      struct Color {
        r: u8,
        g: u8,
        b: u8
      }
      
      frame test() {
        local p: Point;
        local c: Color;
      }
    `);
    expect(ir).toContain("%Point = type { i64, i64 }");
    expect(ir).toContain("%Color = type { i8, i8, i8 }");
  });

  it("should handle struct return in expression", () => {
    const ir = generateIR(`
      struct Point {
        x: u64,
        y: u64
      }
      
      frame create() ret Point {
        local p: Point;
        p.x = 10;
        p.y = 20;
        return p;
      }
      
      frame test() {
        local p: Point = call create();
      }
    `);
    expect(ir).toContain("define %Point @create()");
    expect(ir).toContain("call %Point @create()");
  });
});
