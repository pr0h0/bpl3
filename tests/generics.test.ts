import { describe, expect, it } from "bun:test";

import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "../transpiler/HelperGenerator";
import Scope from "../transpiler/Scope";

function analyze(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const analyzer = new SemanticAnalyzer();
  const scope = new Scope();

  if (!scope.resolveType("u8")) {
    HelperGenerator.generateBaseTypes(scope);
  }

  return analyzer.analyze(program, scope);
}

describe("Generics", () => {
  it("should parse and analyze generic struct", () => {
    const input = `
      struct Box<T> {
          value: T,
      }
      global b: Box<u64>;
    `;
    const scope = analyze(input);
    const variable = scope.resolve("b");
    expect(variable).toBeDefined();
    expect(variable?.varType.name).toBe("Box");
    expect(variable?.varType.genericArgs?.[0]?.name).toBe("u64");
  });

  it("should handle nested generics", () => {
    const input = `
      struct Box<T> {
          value: T,
      }
      struct Container<T> {
          item: T,
      }
      global c: Container<Box<u64>>;
    `;
    const scope = analyze(input);
    const variable = scope.resolve("c");
    expect(variable).toBeDefined();
    expect(variable?.varType.name).toBe("Container");
    expect(variable?.varType.genericArgs?.[0]?.name).toBe("Box");
    expect(variable?.varType.genericArgs?.[0]?.genericArgs?.[0]?.name).toBe(
      "u64",
    );
  });

  it("should handle multiple generic parameters", () => {
    const input = `
      struct Pair<A, B> {
          first: A,
          second: B,
      }
      global p: Pair<u64, u8>;
    `;
    const scope = analyze(input);
    const variable = scope.resolve("p");
    expect(variable).toBeDefined();
    expect(variable?.varType.name).toBe("Pair");
    expect(variable?.varType.genericArgs?.[0]?.name).toBe("u64");
    expect(variable?.varType.genericArgs?.[1]?.name).toBe("u8");
  });

  it("should parse nested generics with >> token", () => {
    const input = `
        struct Box<T> { value: T, }
        global x: Box<Box<u64>>;
      `;
    expect(() => analyze(input)).not.toThrow();
  });

  it("should fail with wrong number of generic arguments", () => {
    const input = `
      struct Box<T> { value: T, }
      global b: Box<u64, u8>;
    `;
    expect(() => analyze(input)).toThrow(/expects 1 generic arguments/);
  });

  it("should fail when using generic on non-generic type", () => {
    const input = `
      struct Point { x: u64, y: u64, }
      global p: Point<u64>;
    `;
    expect(() => analyze(input)).toThrow(/is not generic/);
  });
});
