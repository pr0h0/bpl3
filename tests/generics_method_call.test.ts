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

describe("Generics Method Calls", () => {
  it("should allow calling methods on 'this' inside generic struct methods", () => {
    const input = `
      struct Set<T> {
          count: u64,

          frame has(value: T) ret u8 {
              return 0;
          }

          frame add(value: T) {
              if call this.has(value) {
                  return;
              }
              this.count = this.count + 1;
          }
      }

      frame main() {
          local s: Set<u64>;
          call s.add(10);
      }
    `;

    // Should not throw
    expect(() => analyze(input)).not.toThrow();
  });
});
