import { describe, it, expect } from "bun:test";
import AsmGenerator from "../transpiler/AsmGenerator";
import Scope from "../transpiler/Scope";
import { Parser } from "../parser/parser";
import Lexer from "../lexer/lexer";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "../transpiler/HelperGenerator";

function generate(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  program.optimize();
  
  const scope = new Scope();
  HelperGenerator.generateBaseTypes(null as any, scope);
  
  const analyzer = new SemanticAnalyzer();
  analyzer.analyze(program, scope);
  
  const gen = new AsmGenerator(0);
  program.transpile(gen, scope);
  return gen.build();
}

describe("Tail Call Optimization", () => {
  it("should optimize recursive tail call", () => {
    const input = `
      frame factorial(n: u64, acc: u64) ret u64 {
          if (n == 0) {
              return acc;
          }
          return call factorial(n - 1, acc * n);
      }
    `;
    const asm = generate(input);
    expect(asm).toMatch(/jmp func_factorial_/);
    expect(asm).not.toMatch(/call func_factorial_/);
  });

  it("should NOT optimize non-tail call", () => {
    const input = `
      frame factorial(n: u64) ret u64 {
          if (n == 0) { return 1; }
          return n * call factorial(n - 1);
      }
    `;
    const asm = generate(input);
    expect(asm).toMatch(/call func_factorial_/);
  });
});
