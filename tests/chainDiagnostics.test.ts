import { describe, expect, it } from "bun:test";

import { CompilerError } from "../errors";
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

  analyzer.analyze(program, scope);
}

describe("Chain Diagnostics", () => {
  it("throws on indexing a non-array/non-pointer member", () => {
    const input = `
      struct Vector3 { x: u64, y: u64, z: u64, }
      frame main() {
        local s: Vector3;
        local t: u64 = s.x[0];
      }
    `;
    expect(() => analyze(input)).toThrow(CompilerError);
    expect(() => analyze(input)).toThrow(
      /Cannot index into non-array\/non-pointer type 'u64'/,
    );
  });

  it("throws on accessing a missing member in a chain", () => {
    const input = `
      struct Vector3 { x: u64, y: u64, z: u64, }
      frame main() {
        local s: Vector3;
        local t: u64 = s.nope;
      }
    `;
    expect(() => analyze(input)).toThrow(CompilerError);
    expect(() => analyze(input)).toThrow(/Type 'Vector3' has no member 'nope'/);
  });
});
