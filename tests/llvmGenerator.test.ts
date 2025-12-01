import { describe, it, expect } from "bun:test";
import LlvmGenerator from "../transpiler/LlvmGenerator";
import Scope from "../transpiler/Scope";
import { Parser } from "../parser/parser";
import Lexer from "../lexer/lexer";
import HelperGenerator from "../transpiler/HelperGenerator";

function generateIR(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const gen = new LlvmGenerator();
  const scope = new Scope();
  HelperGenerator.generateBaseTypes(gen as any, scope);
  program.generateIR(gen, scope);
  return gen.build();
}

describe("LlvmGenerator", () => {
  it("should generate global variable", () => {
    const ir = generateIR("global x: u64 = 10;");
    expect(ir).toContain("@x = global i64 10");
  });

  it("should generate function", () => {
    const ir = generateIR("frame main() {}");
    expect(ir).toContain("define void @user_main() {");
    expect(ir).toContain("ret void");
  });

  it("should generate function with return type", () => {
    const ir = generateIR("frame test() ret u64 { return 1; }");
    expect(ir).toContain("define i64 @test() {");
    expect(ir).toContain("ret i64 1");
  });

  it("should generate function with arguments", () => {
    const ir = generateIR(
      "frame add(a: u64, b: u64) ret u64 { return a + b; }",
    );
    expect(ir).toContain("define i64 @add(i64 %a_arg, i64 %b_arg) {");
    expect(ir).toContain("add i64");
  });

  it("should generate local variable", () => {
    const ir = generateIR("frame test() { local x: u64 = 5; }");
    expect(ir).toMatch(/%x_\d+ = alloca i64/);
    expect(ir).toMatch(/store i64 5, ptr %x_\d+/);
  });

  it("should generate if statement", () => {
    const ir = generateIR("frame test() { if (1) { } else { } }");
    expect(ir).toContain("br i1");
    expect(ir).toContain("label %then");
    expect(ir).toContain("label %else");
    expect(ir).toContain("label %if_end");
  });

  it("should generate while loop", () => {
    const ir = generateIR("frame test() { loop { break; } }");
    expect(ir).toContain("br label %loop_start");
    expect(ir).toContain("br label %loop_end"); // break
  });

  it("should generate binary expression", () => {
    const ir = generateIR("frame test() { local x: u64 = 1 + 2; }");
    expect(ir).toContain("add i64 1, 2");
  });

  it("should generate comparison expression", () => {
    const ir = generateIR("frame test() { local x: u8 = 1 == 2; }");
    expect(ir).toContain("icmp eq i64 1, 2");
  });

  it("should generate function call", () => {
    const ir = generateIR("frame foo() {} frame bar() { call foo(); }");
    expect(ir).toContain("call void () @foo()");
  });

  it("should generate struct declaration", () => {
    const ir = generateIR(
      "struct Point { x: u64, y: u64 } frame test() { local p: Point; }",
    );
    expect(ir).toContain("%struct.Point = type { i64, i64 }");
    expect(ir).toContain("alloca %struct.Point");
  });

  it("should generate member access", () => {
    const ir = generateIR(
      "struct Point { x: u64, y: u64 } frame test() { local p: Point; local x: u64 = p.x; }",
    );
    expect(ir).toContain("getelementptr %struct.Point, ptr %p");
  });

  it("should generate array literal", () => {
    const ir = generateIR("frame test() { local arr: u64[2] = [1, 2]; }");
    expect(ir).toContain("store i64 1");
    expect(ir).toContain("store i64 2");
  });

  it("should generate string literal", () => {
    const ir = generateIR('frame test() { local s: string = "hello"; }');
    expect(ir).toContain('c"hello\\00"');
    expect(ir).toContain("@.str"); // String literals are global constants
  });

  it("should generate float literals", () => {
    const ir = generateIR("frame test() { local f: f64 = 3.14; }");
    expect(ir).toContain("3.14");
  });

  it("should generate extern declaration", () => {
    const ir = generateIR(
      'import printf from "libc"; extern printf(fmt: *u8, ...); frame test() { call printf("hello"); }',
    );
    expect(ir).toContain("declare void @printf(ptr, ...)");
  });

  it("should generate switch statement", () => {
    const ir = generateIR(
      "frame test() { switch (1) { case 1: {} default: {} } }",
    );
    expect(ir).toContain("switch i64 1, label %switch_default");
    expect(ir).toContain("i64 1, label %switch_case_1");
  });

  it("should generate ternary expression", () => {
    const ir = generateIR("frame test() { local x: u64 = 1 ? 2 : 3; }");
    expect(ir).toContain("br i1");
    expect(ir).toContain("label %ternary_true");
    expect(ir).toContain("label %ternary_false");
  });

  it("should generate asm block", () => {
    const ir = generateIR('frame test() { asm { "nop" } }');
    expect(ir).toContain("call void asm sideeffect inteldialect");
    expect(ir).toContain('"\\22nop\\22 "');
  });

  it("should generate cast instructions", () => {
    const ir = generateIR(
      "frame test() { local f: f64 = 1.0; local i: u64 = f; }",
    );
    expect(ir).toContain("fptosi double");
  });

  it("should generate unary expressions", () => {
    // Unary minus (int)
    let ir = generateIR("frame test() { local x: u64 = -1; }");
    expect(ir).toContain("sub i64 0, 1");

    // Unary minus (float)
    ir = generateIR("frame test() { local f: f64 = -1.0; }");
    expect(ir).toContain("fneg double");

    // Logical NOT
    ir = generateIR("frame test() { local b: u8 = !1; }");
    expect(ir).toContain("icmp eq i64"); // Checks if 0
    expect(ir).toContain("zext i1");

    // Bitwise NOT
    ir = generateIR("frame test() { local x: u64 = ~1; }");
    expect(ir).toContain("xor i64 1, -1");
  });

  it("should generate pointer operations", () => {
    // Address of
    let ir = generateIR(
      "frame test() { local x: u64 = 10; local p: *u64 = &x; }",
    );
    // &x just returns the alloca pointer, so we expect a store of that pointer
    expect(ir).toContain("store ptr");

    // Dereference
    ir = generateIR(
      "frame test() { local x: u64 = 10; local p: *u64 = &x; local y: u64 = *p; }",
    );
    expect(ir).toContain("load i64, ptr");
  });

  it("should generate null literal", () => {
    const ir = generateIR("frame test() { local p: *u64 = NULL; }");
    expect(ir).toContain("store ptr null");
  });

  it("should generate generics", () => {
    const ir = generateIR(
      "struct Box<T> { value: T } frame test() { local b: Box<u64>; }",
    );
    expect(ir).toContain('%"struct.Box<u64>" = type { i64 }');
    expect(ir).toContain('alloca %"struct.Box<u64>"');
  });

  it("should generate string escapes", () => {
    const ir = generateIR(
      'frame test() { local s: string = "hello\\nworld"; }',
    );
    expect(ir).toContain('c"hello\\0Aworld\\00"');
  });

  it("should generate nested structs", () => {
    const ir = generateIR(
      "struct Inner { x: u64 } struct Outer { inner: Inner } frame test() { local o: Outer; }",
    );
    expect(ir).toContain("%struct.Inner = type { i64 }");
    expect(ir).toContain("%struct.Outer = type { %struct.Inner }");
  });

  it("should generate bitwise operations", () => {
    let ir = generateIR("frame test() { local x: u64 = 1 & 2; }");
    expect(ir).toContain("and i64 1, 2");

    ir = generateIR("frame test() { local x: u64 = 1 | 2; }");
    expect(ir).toContain("or i64 1, 2");

    ir = generateIR("frame test() { local x: u64 = 1 ^ 2; }");
    expect(ir).toContain("xor i64 1, 2");

    ir = generateIR("frame test() { local x: u64 = 1 << 2; }");
    expect(ir).toContain("shl i64 1, 2");

    ir = generateIR("frame test() { local x: u64 = 1 >> 2; }");
    expect(ir).toContain("ashr i64 1, 2");
  });

  it("should generate logical operations", () => {
    let ir = generateIR("frame test() { local x: bool = 1 && 0; }");
    // Current LLVM generator uses bitwise ops for logical operators (no short-circuiting yet)
    expect(ir).toContain("and i64 1, 0");

    ir = generateIR("frame test() { local x: bool = 1 || 0; }");
    expect(ir).toContain("or i64 1, 0");
  });

  it("should generate assignment operators", () => {
    let ir = generateIR("frame test() { local x: u64 = 1; x += 1; }");
    expect(ir).toContain("add i64");
    expect(ir).toContain("store i64");

    ir = generateIR("frame test() { local x: u64 = 1; x -= 1; }");
    expect(ir).toContain("sub i64");

    ir = generateIR("frame test() { local x: u64 = 1; x *= 1; }");
    expect(ir).toContain("mul i64");

    ir = generateIR("frame test() { local x: u64 = 1; x /= 1; }");
    expect(ir).toContain("sdiv i64");
  });

  it("should generate imports", () => {
    const ir = generateIR('import printf from "libc";');
    // Import generates a declare statement if not already defined
    // Since we don't have extern declaration here, it assumes varargs
    expect(ir).toContain("declare i32 @printf(...)");
  });

  it("should generate exports", () => {
    // Export is mostly a check in LLVM, but we can verify it doesn't crash
    const ir = generateIR("frame foo() {} export foo;");
    expect(ir).toContain("define void @foo()");
  });

  it("should generate break and continue", () => {
    const ir = generateIR("frame test() { loop { break; continue; } }");
    expect(ir).toContain("br label %loop_end"); // break
    expect(ir).toContain("br label %loop_start"); // continue
  });

  it("should generate void return", () => {
    const ir = generateIR("frame test() { return; }");
    expect(ir).toContain("ret void");
  });
});
