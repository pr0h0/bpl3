import { describe, it, expect } from "bun:test";
import AsmGenerator from "../transpiler/AsmGenerator";
import Scope from "../transpiler/Scope";
import { Parser } from "../parser/parser";
import Lexer from "../lexer/lexer";

function generate(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const gen = new AsmGenerator(0); // O0 to avoid optimizations changing output too much
  const scope = new Scope();
  program.transpile(gen, scope);
  return gen.build();
}

describe("AsmGenerator", () => {
  it("should generate global variable", () => {
    const asm = generate("global x: u64 = 10;");
    expect(asm).toContain("section .data");
    expect(asm).toMatch(/global_var_x\d+ dq 10/);
  });

  it("should generate function", () => {
    const asm = generate("frame main() {}");
    expect(asm).toContain("global main");
    expect(asm).toContain("main:");
    expect(asm).toContain("call _user_main");
    expect(asm).toContain("func_main_");
  });
});
