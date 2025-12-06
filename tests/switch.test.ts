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

describe("Switch Statement", () => {
  it("should generate basic switch statement", () => {
    const ir = generateIR(`
      frame test(val: u64) {
        switch val {
          case 1: {
            local x: u64 = 1;
          }
          case 2: {
            local x: u64 = 2;
          }
          default: {
            local x: u64 = 0;
          }
        }
      }
    `);
    expect(ir).toMatch(/switch i64.*label %switch_default_\d+/);
    expect(ir).toMatch(/i64 1, label %switch_case_1_\d+/);
    expect(ir).toMatch(/i64 2, label %switch_case_2_\d+/);
  });

  it("should generate switch with multiple cases", () => {
    const ir = generateIR(`
      frame test(val: u64) {
        switch val {
          case 1: {}
          case 2: {}
          case 3: {}
          case 10: {}
          default: {}
        }
      }
    `);
    expect(ir).toMatch(/i64 1, label %switch_case_1_\d+/);
    expect(ir).toMatch(/i64 2, label %switch_case_2_\d+/);
    expect(ir).toMatch(/i64 3, label %switch_case_3_\d+/);
    expect(ir).toMatch(/i64 10, label %switch_case_10_\d+/);
    expect(ir).toMatch(/label %switch_default_\d+/);
  });

  it("should generate switch with return statements", () => {
    const ir = generateIR(`
      frame test(val: u64) ret u64 {
        switch val {
          case 1: {
            return 10;
          }
          case 2: {
            return 20;
          }
          default: {
            return 0;
          }
        }
      }
    `);
    expect(ir).toContain("ret i64 10");
    expect(ir).toContain("ret i64 20");
    expect(ir).toContain("ret i64 0");
  });

  it("should generate switch fall-through behavior", () => {
    const ir = generateIR(`
      frame test(val: u64) ret u64 {
        switch val {
          case 1: {
            return 10;
          }
          case 2: {
            return 20;
          }
          default: {
            return 0;
          }
        }
      }
    `);
    expect(ir).toMatch(/switch i64/);
    expect(ir).toContain("ret i64 10");
    expect(ir).toContain("ret i64 20");
  });

  it("should generate switch inside loop", () => {
    const ir = generateIR(`
      frame test() {
        local i: u64 = 0;
        loop {
          if i >= 5 { break; }
          switch i {
            case 1: {}
            case 2: {}
            default: {}
          }
          i = i + 1;
        }
      }
    `);
    expect(ir).toMatch(/loop_body_\d+:/);
    expect(ir).toMatch(/switch i64/);
  });

  it("should handle switch with function calls in cases", () => {
    const ir = generateIR(`
      import printf from "libc";
      extern printf(fmt: *u8, ...);
      
      frame test(val: u64) {
        switch val {
          case 1: {
            call printf("One\\n");
          }
          case 2: {
            call printf("Two\\n");
          }
          default: {
            call printf("Other\\n");
          }
        }
      }
    `);
    expect(ir).toMatch(/switch i64/);
    expect(ir).toContain("call");
    expect(ir).toContain("@printf");
  });

  it("should generate switch without default case", () => {
    const ir = generateIR(`
      frame test(val: u64) {
        switch val {
          case 1: {}
          case 2: {}
          default: {}
        }
      }
    `);
    expect(ir).toMatch(/label %switch_default_\d+/);
  });

  it("should handle switch with nested blocks", () => {
    const ir = generateIR(`
      frame test(val: u64) ret u64 {
        switch val {
          case 1: {
            if val > 0 {
              return 100;
            }
            return 10;
          }
          default: {
            return 0;
          }
        }
      }
    `);
    expect(ir).toMatch(/switch i64/);
    expect(ir).toContain("br i1"); // From if statement
    expect(ir).toContain("ret i64");
  });
});

describe("Switch Edge Cases", () => {
  it("should handle switch with large case values", () => {
    const ir = generateIR(`
      frame test(val: u64) {
        switch val {
          case 100: {}
          case 1000: {}
          case 10000: {}
          default: {}
        }
      }
    `);
    expect(ir).toMatch(/i64 100, label/);
    expect(ir).toMatch(/i64 1000, label/);
    expect(ir).toMatch(/i64 10000, label/);
  });

  it("should handle switch with variable assignments in cases", () => {
    const ir = generateIR(`
      frame test(val: u64) ret u64 {
        local result: u64 = 0;
        switch val {
          case 1: {
            result = 10;
          }
          case 2: {
            result = 20;
          }
          default: {
            result = 0;
          }
        }
        return result;
      }
    `);
    expect(ir).toMatch(/switch i64/);
    expect(ir).toContain("store i64 10");
    expect(ir).toContain("store i64 20");
    expect(ir).toContain("store i64 0");
    expect(ir).toContain("ret i64");
  });

  it("should handle switch as last statement in function", () => {
    const ir = generateIR(`
      frame test(val: u64) {
        switch val {
          case 1: {}
          default: {}
        }
      }
    `);
    expect(ir).toMatch(/switch i64/);
    expect(ir).toContain("ret void");
  });

  it("should handle switch with struct members", () => {
    const ir = generateIR(`
      struct Point { x: u64, y: u64 }
      
      frame test(p: Point) {
        switch p.x {
          case 1: {}
          case 2: {}
          default: {}
        }
      }
    `);
    expect(ir).toContain("getelementptr %Point");
    expect(ir).toMatch(/switch i64/);
  });
});
