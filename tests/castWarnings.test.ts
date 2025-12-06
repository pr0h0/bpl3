import { describe, expect, it } from "bun:test";

import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "../transpiler/HelperGenerator";
import Scope from "../transpiler/Scope";

function analyzeAndGetWarnings(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const analyzer = new SemanticAnalyzer();
  const scope = new Scope();

  if (!scope.resolveType("u8")) {
    HelperGenerator.generateBaseTypes(scope);
  }

  analyzer.analyze(program, scope);
  return analyzer.warnings.map((w) => w.message);
}

describe("Implicit Cast Warnings", () => {
  it("warns on integer narrowing u64 -> u8", () => {
    const input = `
      frame main() {
        local a: u8 = 1000;
      }
    `;
    const warnings = analyzeAndGetWarnings(input);
    expect(
      warnings.some((m) =>
        m.includes("Implicit integer narrowing from 'u64' to 'u8'"),
      ),
    ).toBeTrue();
  });

  it("warns on f64 -> f32 precision loss in function arg", () => {
    const input = `
      frame foo(x: f32) {}
      frame main() {
        call foo(1.23);
      }
    `;
    const warnings = analyzeAndGetWarnings(input);
    expect(
      warnings.some((m) =>
        m.includes("Implicit cast from f64 to f32 may lose precision"),
      ),
    ).toBeTrue();
  });

  it("warns on float -> integer truncation", () => {
    const input = `
      frame main() {
        local b: u64 = 1.5;
      }
    `;
    const warnings = analyzeAndGetWarnings(input);
    expect(
      warnings.some((m) =>
        m.includes(
          "Implicit cast from float 'f64' to integer 'u64' may truncate",
        ),
      ),
    ).toBeTrue();
  });

  it("warns on integer -> float promotion", () => {
    const input = `
      frame main() {
        local c: f32 = 1;
      }
    `;
    const warnings = analyzeAndGetWarnings(input);
    expect(
      warnings.some((m) =>
        m.includes("Implicit cast from integer 'u64' to float 'f32'"),
      ),
    ).toBeTrue();
  });

  it("warns on pointer <-> integer cast", () => {
    const input = `
      frame main() {
        local a: u8 = 0;
        local p: *u8 = &a;
        local x: u64 = p;
      }
    `;
    const warnings = analyzeAndGetWarnings(input);
    expect(
      warnings.some((m) =>
        m.includes(
          "Implicit cast between pointer '*u8' and integer 'u64' may be unsafe",
        ),
      ),
    ).toBeTrue();
  });

  it("warns on implicit pointer depth cast (*u8 -> **u8)", () => {
    const input = `
      frame main() {
        local a: u8 = 0;
        local p: *u8 = &a;
        local q: **u8 = p;
      }
    `;
    const warnings = analyzeAndGetWarnings(input);
    expect(
      warnings.some((m) =>
        m.includes("Implicit pointer cast from '*u8' to '**u8'"),
      ),
    ).toBeTrue();
  });
});
