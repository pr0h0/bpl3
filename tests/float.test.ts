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

describe("Float Operations", () => {
  it("should generate f32 and f64 types", () => {
    const ir = generateIR(`
      frame test() {
        local f32_var: f32 = 1.5;
        local f64_var: f64 = 2.5;
      }
    `);
    expect(ir).toContain("alloca float");
    expect(ir).toContain("alloca double");
    // f32 literals are cast from f64
    expect(ir).toContain("fptrunc double 1.5 to float");
    expect(ir).toContain("store double 2.5");
  });

  it("should generate float addition", () => {
    const ir = generateIR(`
      frame test() {
        local a: f64 = 1.5;
        local b: f64 = 2.5;
        local c: f64 = a + b;
      }
    `);
    expect(ir).toContain("fadd double");
  });

  it("should generate float subtraction", () => {
    const ir = generateIR(`
      frame test() {
        local a: f64 = 5.5;
        local b: f64 = 2.5;
        local c: f64 = a - b;
      }
    `);
    expect(ir).toContain("fsub double");
  });

  it("should generate float multiplication", () => {
    const ir = generateIR(`
      frame test() {
        local a: f64 = 2.0;
        local b: f64 = 3.0;
        local c: f64 = a * b;
      }
    `);
    expect(ir).toContain("fmul double");
  });

  it("should generate float division", () => {
    const ir = generateIR(`
      frame test() {
        local a: f64 = 10.0;
        local b: f64 = 2.0;
        local c: f64 = a / b;
      }
    `);
    expect(ir).toContain("fdiv double");
  });

  it("should generate float comparisons", () => {
    const ir = generateIR(`
      frame test() {
        local a: f64 = 1.0;
        local b: f64 = 2.0;
        local eq: u8 = a == b;
        local ne: u8 = a != b;
        local lt: u8 = a < b;
        local gt: u8 = a > b;
        local le: u8 = a <= b;
        local ge: u8 = a >= b;
      }
    `);
    expect(ir).toContain("fcmp oeq double");
    expect(ir).toContain("fcmp one double");
    expect(ir).toContain("fcmp olt double");
    expect(ir).toContain("fcmp ogt double");
    expect(ir).toContain("fcmp ole double");
    expect(ir).toContain("fcmp oge double");
  });

  it("should generate float structs", () => {
    const ir = generateIR(`
      struct Point {
        x: f64,
        y: f64
      }
      frame test() {
        local p: Point;
        p.x = 1.5;
        p.y = 2.5;
      }
    `);
    expect(ir).toContain("%Point = type { double, double }");
    expect(ir).toContain("alloca %Point");
    expect(ir).toContain("getelementptr %Point");
  });

  it("should generate float arrays", () => {
    const ir = generateIR(`
      frame test() {
        local arr: f64[3];
        arr[0] = 1.1;
        arr[1] = 2.2;
        arr[2] = 3.3;
      }
    `);
    expect(ir).toContain("alloca [3 x double]");
    expect(ir).toContain("store double 1.1");
    expect(ir).toContain("store double 2.2");
    expect(ir).toContain("store double 3.3");
  });

  it("should generate float function arguments", () => {
    const ir = generateIR(`
      frame add(a: f64, b: f64) ret f64 {
        return a + b;
      }
    `);
    expect(ir).toContain("define double @add(double %a, double %b)");
    expect(ir).toContain("fadd double");
  });

  it("should generate float to int cast", () => {
    const ir = generateIR(`
      frame test() {
        local f: f64 = 3.14;
        local i: u64 = f;
      }
    `);
    expect(ir).toContain("fptosi double");
  });

  it("should generate int to float cast", () => {
    const ir = generateIR(`
      frame test() {
        local i: u64 = 42;
        local f: f64 = i;
      }
    `);
    expect(ir).toContain("sitofp i64");
  });

  it("should generate f32 to f64 cast", () => {
    const ir = generateIR(`
      frame test() {
        local f32_val: f32 = 1.5;
        local f64_val: f64 = f32_val;
      }
    `);
    expect(ir).toContain("fpext float");
  });

  it("should generate f64 to f32 cast", () => {
    const ir = generateIR(`
      frame test() {
        local f64_val: f64 = 1.5;
        local f32_val: f32 = f64_val;
      }
    `);
    expect(ir).toContain("fptrunc double");
  });

  it("should handle negative float literals", () => {
    const ir = generateIR(`
      frame test() {
        local neg: f64 = -5.5;
      }
    `);
    expect(ir).toContain("fsub double");
  });

  it("should generate float assignment operators", () => {
    const ir = generateIR(`
      frame test() {
        local a: f64 = 10.0;
        a += 5.0;
        a -= 2.0;
        a *= 2.0;
        a /= 4.0;
      }
    `);
    expect(ir).toContain("fadd double");
    expect(ir).toContain("fsub double");
    expect(ir).toContain("fmul double");
    expect(ir).toContain("fdiv double");
  });
});
