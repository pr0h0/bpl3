import { describe, it, expect } from "bun:test";
import AsmGenerator from "../transpiler/AsmGenerator";
import Scope from "../transpiler/Scope";
import { Parser } from "../parser/parser";
import Lexer from "../lexer/lexer";

function generate(input: string, filename: string = "test.bpl") {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const gen = new AsmGenerator(0);
  gen.setSourceFile(filename);
  const scope = new Scope();
  program.transpile(gen, scope);
  return gen.build();
}

describe("DWARF Debug Info", () => {
  it("should generate %line directives", () => {
    const input = `
      frame main() {
          local x: u64 = 10;
          return;
      }
    `;
    const asm = generate(input, "main.bpl");
    
    // Check for %line directive
    // The format is %line <line_number> "<filename>"
    expect(asm).toMatch(/%line \d+ "main.bpl"/);
  });

  it("should generate correct line numbers", () => {
     const input = `
frame main() {
    local x: u64 = 10;
}
`;
    // Line 1: empty
    // Line 2: frame main() {
    // Line 3:     local x: u64 = 10;
    // Line 4: }
    
    const asm = generate(input, "lines.bpl");
    // We expect a directive for line 3 where the variable is declared/initialized
    expect(asm).toMatch(/%line 3 "lines.bpl"/);
  });
});
