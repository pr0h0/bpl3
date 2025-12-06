import { describe, expect, it } from "bun:test";

import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { MemorySafetyAnalyzer } from "../transpiler/analysis/MemorySafetyAnalyzer";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "../transpiler/HelperGenerator";
import Scope from "../transpiler/Scope";

function analyzeMemorySafety(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const scope = new Scope();
  HelperGenerator.generateBaseTypes(scope);

  const semanticAnalyzer = new SemanticAnalyzer();
  const populatedScope = semanticAnalyzer.analyze(program, scope);

  const analyzer = new MemorySafetyAnalyzer();
  analyzer.analyze(program, populatedScope);

  return {
    errors: analyzer.errors,
    warnings: analyzer.warnings,
  };
}

describe("Memory Safety - Null Pointer Checks", () => {
  it("should warn about uninitialized pointer", () => {
    const result = analyzeMemorySafety(`
      frame test() {
        local p: *u64;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("Uninitialized pointer");
  });

  it("should warn about potential null pointer dereference", () => {
    const result = analyzeMemorySafety(`
      frame test() {
        local p: *u64 = null;
        local x: u64 = *p;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    const hasWarning = result.warnings.some((w) =>
      w.message.includes("null pointer dereference"),
    );
    expect(hasWarning).toBe(true);
  });

  it("should not warn when pointer is null-checked", () => {
    const result = analyzeMemorySafety(`
      frame test() {
        local p: *u64 = null;
        if (p != null) {
          local x: u64 = *p;
        }
      }
    `);
    // Should have fewer warnings or no null pointer warning
    const nullWarnings = result.warnings.filter((w) =>
      w.message.includes("null pointer"),
    );
    expect(nullWarnings.length).toBe(0);
  });
});

describe("Memory Safety - Use After Free", () => {
  it("should error on use after free", () => {
    const result = analyzeMemorySafety(`
      import free from "libc";
      frame test() {
        local p: *u64 = null;
        call free(p);
        local x: u64 = *p;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("Use-after-free");
  });

  it("should error on double free", () => {
    const result = analyzeMemorySafety(`
      import free from "libc";
      frame test() {
        local p: *u64 = null;
        call free(p);
        call free(p);
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    const doubleFree = result.errors.find((e) =>
      e.message.includes("Double free"),
    );
    expect(doubleFree).toBeDefined();
  });
});

describe("Memory Safety - Buffer Overflow", () => {
  it("should error on constant out-of-bounds access", () => {
    const result = analyzeMemorySafety(`
      frame test() {
        local arr: u64[10];
        local x: u64 = arr[10];
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("out of bounds");
  });

  it("should warn on runtime array index", () => {
    const result = analyzeMemorySafety(`
      frame test(i: u64) {
        local arr: u64[10];
        local x: u64 = arr[i];
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("Unchecked array index");
  });

  it("should warn on pointer indexing", () => {
    const result = analyzeMemorySafety(`
      frame test(p: *u64, i: u64) {
        local x: u64 = p[i];
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("out-of-bounds");
  });
});

describe("Memory Safety - Integer Overflow", () => {
  it("should error on integer literal out of range", () => {
    const result = analyzeMemorySafety(`
      frame test() {
        local x: u8 = 300;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("out of range");
  });

  it("should warn on signed integer overflow", () => {
    const result = analyzeMemorySafety(`
      frame test(a: i32, b: i32) {
        local c: i32 = a + b;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("signed integer overflow");
  });
});

describe("Memory Safety - Division by Zero", () => {
  it("should error on constant division by zero", () => {
    const result = analyzeMemorySafety(`
      frame test() {
        local x: u64 = 10 / 0;
      }
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain("Division by zero");
  });

  it("should warn on potential division by zero", () => {
    const result = analyzeMemorySafety(`
      frame test(divisor: u64) {
        local x: u64 = 10 / divisor;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("division by zero");
  });
});

describe("Memory Safety - Pointer Arithmetic", () => {
  it("should warn on pointer arithmetic", () => {
    const result = analyzeMemorySafety(`
      frame test(p: *u64) {
        local q: *u64 = p + 5;
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.message).toContain("Pointer arithmetic");
  });
});

describe("Memory Safety - Memory Leaks", () => {
  it("should warn about memory leak", () => {
    const result = analyzeMemorySafety(`
      import malloc from "libc";
      frame test() {
        local p: *u64 = call malloc(8);
      }
    `);
    expect(result.warnings.length).toBeGreaterThan(0);
    const leakWarning = result.warnings.find((w) =>
      w.message.includes("memory leak"),
    );
    expect(leakWarning).toBeDefined();
  });
});
