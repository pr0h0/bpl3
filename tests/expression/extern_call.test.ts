import { expect, test, describe } from "bun:test";
import Tokenizer from "../../lexer/lexer";
import { Parser } from "../../parser/parser";
import AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";

function generate(input: string) {
  const tokenizer = new Tokenizer(input);
  const tokens = tokenizer.tokenize();
  const parser = new Parser(tokens);
  const exprs = parser.parse();
  const generator = new AsmGenerator();
  const scope = new Scope();
  exprs.transpile(generator, scope);
  return generator.build();
}

describe("Extern Call", () => {
  test("Extern declaration prevents f32 to f64 promotion", () => {
    const code = `
      import printf from "libc";
      extern printf(val: f32);
      
      frame main() {
        local f: f32 = 1.5;
        call printf(f);
      }
    `;

    const asm = generate(code);
    
    expect(asm).not.toContain("cvtss2sd");
  });

  test("Without extern declaration, f32 is promoted to f64 for unknown args", () => {
    const code = `
      import printf from "libc";
      # No extern declaration
      
      frame main() {
        local f: f32 = 1.5;
        call printf(f);
      }
    `;

    const asm = generate(code);

    // Should contain cvtss2sd because printf args are unknown
    expect(asm).toContain("cvtss2sd");
  });

  test("Extern declaration enforces argument types in generation", () => {
     const code = `
      import pow from "libc";
      extern pow(base: f64, exp: f64) ret f64;
      
      frame main() {
        call pow(2.0, 3.0);
      }
    `;

    const asm = generate(code);

    // Check that we are using xmm registers for arguments
    expect(asm).toContain("movq xmm0, rax"); // First arg
    expect(asm).toContain("movq xmm1, rax"); // Second arg
  });

  test("Without extern declaration, f32 is promoted to f64 for unknown args", () => {
    const code = `
      import printf from "libc";
      # No extern declaration
      
      frame main() {
        local f: f32 = 1.5;
        call printf(f);
      }
    `;

    const asm = generate(code);

    // Should contain cvtss2sd because printf args are unknown
    expect(asm).toContain("cvtss2sd");
  });

  test("Extern declaration enforces argument types in generation", () => {
     const code = `
      import pow from "libc";
      extern pow(base: f64, exp: f64) ret f64;
      
      frame main() {
        call pow(2.0, 3.0);
      }
    `;

    const asm = generate(code);

    // Check that we are using xmm registers for arguments
    // The generator moves rax (containing float bits) to xmm registers
    expect(asm).toContain("movq xmm0, rax"); // First arg
    expect(asm).toContain("movq xmm1, rax"); // Second arg
  });
});
