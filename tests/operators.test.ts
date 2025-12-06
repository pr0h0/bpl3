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

describe("Arithmetic Operators", () => {
  it("should generate addition", () => {
    const ir = generateIR("frame test() { local x: u64 = 1 + 2; }");
    expect(ir).toContain("add i64 1, 2");
  });

  it("should generate subtraction", () => {
    const ir = generateIR("frame test() { local x: u64 = 5 - 2; }");
    expect(ir).toContain("sub i64 5, 2");
  });

  it("should generate multiplication", () => {
    const ir = generateIR("frame test() { local x: u64 = 3 * 4; }");
    expect(ir).toContain("mul i64 3, 4");
  });

  it("should generate division", () => {
    const ir = generateIR("frame test() { local x: u64 = 10 / 2; }");
    // / operator does float division, use // for integer division
    expect(ir).toContain("fdiv double");
  });

  it("should generate modulo", () => {
    const ir = generateIR("frame test() { local x: u64 = 10 % 3; }");
    expect(ir).toContain("srem i64 10, 3");
  });
});

describe("Bitwise Operators", () => {
  it("should generate bitwise AND", () => {
    const ir = generateIR("frame test() { local x: u64 = 10 & 3; }");
    expect(ir).toContain("and i64 10, 3");
  });

  it("should generate bitwise OR", () => {
    const ir = generateIR("frame test() { local x: u64 = 10 | 3; }");
    expect(ir).toContain("or i64 10, 3");
  });

  it("should generate bitwise XOR", () => {
    const ir = generateIR("frame test() { local x: u64 = 10 ^ 3; }");
    expect(ir).toContain("xor i64 10, 3");
  });

  it("should generate left shift", () => {
    const ir = generateIR("frame test() { local x: u64 = 10 << 2; }");
    expect(ir).toContain("shl i64 10, 2");
  });

  it("should generate right shift", () => {
    const ir = generateIR("frame test() { local x: u64 = 10 >> 2; }");
    expect(ir).toContain("ashr i64 10, 2");
  });

  it("should generate bitwise NOT", () => {
    const ir = generateIR("frame test() { local x: u64 = ~10; }");
    expect(ir).toContain("xor i64 10, -1");
  });
});

describe("Comparison Operators", () => {
  it("should generate equality comparison", () => {
    const ir = generateIR("frame test() { local x: u8 = 10 == 10; }");
    expect(ir).toContain("icmp eq i64 10, 10");
  });

  it("should generate inequality comparison", () => {
    const ir = generateIR("frame test() { local x: u8 = 10 != 5; }");
    expect(ir).toContain("icmp ne i64 10, 5");
  });

  it("should generate less than comparison", () => {
    const ir = generateIR("frame test() { local x: u8 = 5 < 10; }");
    expect(ir).toContain("icmp slt i64 5, 10");
  });

  it("should generate greater than comparison", () => {
    const ir = generateIR("frame test() { local x: u8 = 10 > 5; }");
    expect(ir).toContain("icmp sgt i64 10, 5");
  });

  it("should generate less than or equal comparison", () => {
    const ir = generateIR("frame test() { local x: u8 = 5 <= 10; }");
    expect(ir).toContain("icmp sle i64 5, 10");
  });

  it("should generate greater than or equal comparison", () => {
    const ir = generateIR("frame test() { local x: u8 = 10 >= 5; }");
    expect(ir).toContain("icmp sge i64 10, 5");
  });
});

describe("Logical Operators", () => {
  it("should generate logical AND", () => {
    const ir = generateIR("frame test() { local x: u8 = 1 && 1; }");
    expect(ir).toContain("and i64 1, 1");
  });

  it("should generate logical OR", () => {
    const ir = generateIR("frame test() { local x: u8 = 1 || 0; }");
    expect(ir).toContain("or i64 1, 0");
  });

  it("should generate logical NOT", () => {
    const ir = generateIR("frame test() { local x: u8 = !1; }");
    expect(ir).toContain("icmp eq i64");
    expect(ir).toContain("zext i1");
  });
});

describe("Assignment Operators", () => {
  it("should generate addition assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x += 5; }");
    expect(ir).toContain("add i64");
    expect(ir).toContain("store i64");
  });

  it("should generate subtraction assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x -= 5; }");
    expect(ir).toContain("sub i64");
    expect(ir).toContain("store i64");
  });

  it("should generate multiplication assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x *= 5; }");
    expect(ir).toContain("mul i64");
    expect(ir).toContain("store i64");
  });

  it("should generate division assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x /= 5; }");
    expect(ir).toContain("sdiv i64");
    expect(ir).toContain("store i64");
  });

  it("should generate modulo assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x %= 3; }");
    expect(ir).toContain("srem i64");
    expect(ir).toContain("store i64");
  });

  it("should generate XOR assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x ^= 5; }");
    expect(ir).toContain("xor i64");
    expect(ir).toContain("store i64");
  });

  it("should generate AND assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x &= 5; }");
    expect(ir).toContain("and i64");
    expect(ir).toContain("store i64");
  });

  it("should generate OR assignment", () => {
    const ir = generateIR("frame test() { local x: u64 = 10; x |= 5; }");
    expect(ir).toContain("or i64");
    expect(ir).toContain("store i64");
  });
});

describe("Unary Operators", () => {
  it("should generate unary minus for integers", () => {
    const ir = generateIR("frame test() { local x: u64 = -10; }");
    expect(ir).toContain("sub i64 0, 10");
  });

  it("should generate unary minus for floats", () => {
    const ir = generateIR("frame test() { local x: f64 = -10.5; }");
    expect(ir).toContain("fsub double");
  });

  it("should generate address-of operator", () => {
    const ir = generateIR(
      "frame test() { local x: u64 = 10; local p: *u64 = &x; }",
    );
    expect(ir).toContain("alloca i64");
    expect(ir).toContain("store ptr");
  });

  it("should generate dereference operator", () => {
    const ir = generateIR(
      "frame test() { local x: u64 = 10; local p: *u64 = &x; local y: u64 = *p; }",
    );
    expect(ir).toContain("load i64, ptr");
  });
});

describe("Operator Precedence", () => {
  it("should respect multiplication before addition", () => {
    const ir = generateIR("frame test() { local x: u64 = 2 + 3 * 4; }");
    expect(ir).toContain("mul i64 3, 4");
    expect(ir).toContain("add i64");
  });

  it("should handle parentheses", () => {
    const ir = generateIR("frame test() { local x: u64 = (2 + 3) * 4; }");
    expect(ir).toContain("add i64 2, 3");
    expect(ir).toContain("mul i64");
  });
});
