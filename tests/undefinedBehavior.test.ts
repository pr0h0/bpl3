import { describe, expect, it } from "bun:test";

import { CompilerError } from "../errors";
import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "../transpiler/HelperGenerator";
import Scope from "../transpiler/Scope";

function analyzeSemantics(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const scope = new Scope();
  HelperGenerator.generateBaseTypes(scope);

  const analyzer = new SemanticAnalyzer();

  try {
    analyzer.analyze(program, scope);
    return { errors: [], warnings: analyzer.warnings };
  } catch (error) {
    if (error instanceof CompilerError) {
      return { errors: [error], warnings: analyzer.warnings };
    }
    throw error;
  }
}

describe("Undefined Behavior - Shift Operations", () => {
  it("should error on negative shift amount", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u64 = 10 << -1;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("negative");
  });

  it("should error on shift amount >= type width", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u8 = 10 << 8;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("undefined behavior");
  });

  it("should warn on runtime shift amount", () => {
    const result = analyzeSemantics(`
      frame test(n: u64) {
        local x: u64 = 10 << n;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain(
      "Shift amount should be checked",
    );
  });

  it("should error on shift of float", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: f64 = 10.5 << 2;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("floating-point");
  });

  it("should warn on left shift of signed integer", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: i32 = 10 << 5;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("signed integer");
  });
});

describe("Undefined Behavior - Modulo", () => {
  it("should error on modulo by zero", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u64 = 10 % 0;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("Modulo by zero");
  });
});

describe("Undefined Behavior - Pointer Arithmetic", () => {
  it("should error on adding two pointers", () => {
    const result = analyzeSemantics(`
      frame test(p: *u64, q: *u64) {
        local r: *u64 = p + q;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("Invalid pointer arithmetic");
  });

  it("should error on multiplying pointers", () => {
    const result = analyzeSemantics(`
      frame test(p: *u64, q: *u64) {
        local r: *u64 = p * q;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("Invalid pointer arithmetic");
  });

  it("should allow pointer-pointer subtraction", () => {
    const result = analyzeSemantics(`
      frame test(p: *u64, q: *u64) {
        local diff: u64 = p - q;
      }
    `);
    // Should compile without errors
    expect(result.errors.length).toBe(0);
  });

  it("should warn on subtracting different pointer types", () => {
    const result = analyzeSemantics(`
      frame test(p: *u64, q: *u32) {
        local diff: u64 = p - q;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("different types");
  });
});

describe("Undefined Behavior - Uninitialized Variables", () => {
  it("should warn on uninitialized local variable", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u64;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    const uninitWarning = result.warnings.find((w) =>
      w.message.includes("without initialization"),
    );
    expect(uninitWarning).toBeDefined();
  });

  it("should warn when using potentially uninitialized variable", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u64;
        local y: u64 = x + 1;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    const useWarning = result.warnings.find((w) =>
      w.message.includes("may be used before initialization"),
    );
    expect(useWarning).toBeDefined();
  });

  it("should not warn when variable is initialized", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u64 = 10;
        local y: u64 = x + 1;
      }
    `);
    const useWarning = result.warnings.find((w) =>
      w.message.includes("may be used before initialization"),
    );
    expect(useWarning).toBeUndefined();
  });

  it("should track initialization through assignments", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u64;
        x = 10;
        local y: u64 = x + 1;
      }
    `);
    const useWarning = result.warnings.find(
      (w) =>
        w.message.includes("may be used before initialization") &&
        w.message.includes("x"),
    );
    expect(useWarning).toBeUndefined();
  });

  it("should not warn about function parameters", () => {
    const result = analyzeSemantics(`
      frame test(x: u64) {
        local y: u64 = x + 1;
      }
    `);
    const paramWarning = result.warnings.find(
      (w) => w.message.includes("x") && w.message.includes("initialization"),
    );
    expect(paramWarning).toBeUndefined();
  });
});

describe("Type Safety - Strict Checks", () => {
  it("should enforce const initialization", () => {
    // Note: The parser already enforces this, so we can't test it in semantic analysis
    // This test checks that uninitialized variables generate warnings
    const result = analyzeSemantics(`
      frame test() {
        local x: u64;
        local y: u64 = x;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(
      result.warnings.some((w) => w.message.includes("initialization")),
    ).toBe(true);
  });

  it("should check variable redefinition", () => {
    const result = analyzeSemantics(`
      frame test() {
        local x: u64 = 10;
        local x: u64 = 20;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("already defined");
  });
});

describe("Function Safety", () => {
  it("should check argument count", () => {
    const result = analyzeSemantics(`
      frame foo(x: u64) {}
      frame test() {
        call foo(1, 2);
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("expects 1 argument");
  });

  it("should check return type", () => {
    const result = analyzeSemantics(`
      frame foo() ret u64 {
        return;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("expects return type");
  });
});
