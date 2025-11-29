import { describe, it, expect } from "bun:test";
import Lexer from "../lexer/lexer";
import TokenType from "../lexer/tokenType";
import { Parser } from "../parser/parser";
import ExpressionType from "../parser/expressionType";
import VariableDeclarationExpr from "../parser/expression/variableDeclarationExpr";
import BinaryExpr from "../parser/expression/binaryExpr";
import AsmGenerator from "../transpiler/AsmGenerator";
import Scope from "../transpiler/Scope";
import HelperGenerator from "../transpiler/HelperGenerator";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

function generate(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  const program = parser.parse();
  const gen = new AsmGenerator(0);
  const scope = new Scope();
  HelperGenerator.generateBaseTypes(gen, scope);
  program.transpile(gen, scope);
  return gen.build();
}

describe("Floating Point Support", () => {
  describe("Lexer", () => {
    it("should tokenize float literals", () => {
      const input = "3.14 0.5 -10.5 1.0";
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();

      // Note: Negative numbers are usually parsed as MINUS then NUMBER in many lexers,
      // but let's check how this lexer handles them.
      // Based on typical lexer behavior:
      // 3.14 -> NUMBER_LITERAL
      // 0.5 -> NUMBER_LITERAL
      // -10.5 -> MINUS, NUMBER_LITERAL
      // 1.0 -> NUMBER_LITERAL

      expect(tokens[0]!.type).toBe(TokenType.NUMBER_LITERAL);
      expect(tokens[0]!.value).toBe("3.14");

      expect(tokens[1]!.type).toBe(TokenType.NUMBER_LITERAL);
      expect(tokens[1]!.value).toBe("0.5");

      expect(tokens[2]!.type).toBe(TokenType.MINUS);
      expect(tokens[3]!.type).toBe(TokenType.NUMBER_LITERAL);
      expect(tokens[3]!.value).toBe("10.5");

      expect(tokens[4]!.type).toBe(TokenType.NUMBER_LITERAL);
      expect(tokens[4]!.value).toBe("1.0");
    });

    it("should tokenize float types", () => {
      const input = "f32 f64";
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();

      // Types are usually identifiers in the lexer phase
      expect(tokens[0]!.type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0]!.value).toBe("f32");

      expect(tokens[1]!.type).toBe(TokenType.IDENTIFIER);
      expect(tokens[1]!.value).toBe("f64");
    });
  });

  describe("Parser", () => {
    it("should parse f64 variable declaration", () => {
      const program = parse("global pi: f64 = 3.14159;");
      const expr = program.expressions[0] as VariableDeclarationExpr;

      expect(expr.type).toBe(ExpressionType.VariableDeclaration);
      expect(expr.name).toBe("pi");
      expect(expr.varType.name).toBe("f64");
      expect(expr.value?.type).toBe(ExpressionType.NumberLiteralExpr);
      // The parser might store the value as a string or number, let's check
      expect((expr.value as any).value).toBe("3.14159");
    });

    it("should parse f32 variable declaration", () => {
      const program = parse("global f: f32 = 1.5;");
      const expr = program.expressions[0] as VariableDeclarationExpr;

      expect(expr.varType.name).toBe("f32");
    });

    it("should parse float arithmetic", () => {
      const program = parse("global x: f64 = 1.5 + 2.5 * 3.0;");
      const expr = program.expressions[0] as VariableDeclarationExpr;
      const binary = expr.value as BinaryExpr;

      expect(binary.type).toBe(ExpressionType.BinaryExpression);
      expect(binary.operator.type).toBe(TokenType.PLUS);

      const right = binary.right as BinaryExpr;
      expect(right.operator.type).toBe(TokenType.STAR);
    });

    it("should parse float comparisons", () => {
      const program = parse("global res: u8 = 1.5 < 2.5;");
      const expr = program.expressions[0] as VariableDeclarationExpr;
      const binary = expr.value as BinaryExpr;

      expect(binary.operator.type).toBe(TokenType.LESS_THAN);
    });
  });

  describe("Generator", () => {
    it("should generate float constants in data section", () => {
      const asm = generate("global pi: f64 = 3.14;");
      // Should see the float constant defined
      // The exact label format depends on implementation, but it should be there
      expect(asm).toContain("dq 3.14"); // 3.14 as double representation
      // Or it might use a different format, but let's check for the variable
      expect(asm).toMatch(/global_var_pi\d+/);
    });

    it("should generate float arithmetic instructions", () => {
      const input = `
        frame test() {
            local a: f64 = 1.0;
            local b: f64 = 2.0;
            local c: f64 = a + b;
        }
      `;
      const asm = generate(input);

      // Should see movsd (move scalar double) and addsd (add scalar double)
      expect(asm).toContain("movsd");
      expect(asm).toContain("addsd");
    });

    it("should generate float comparison instructions", () => {
      const input = `
        frame test() {
            local a: f64 = 1.0;
            local b: f64 = 2.0;
            if a < b {
                return;
            }
        }
      `;
      const asm = generate(input);

      // Should see ucomisd (unordered compare scalar double)
      expect(asm).toContain("ucomisd");
      // Should see setcc instruction (seta, setae, setb, setbe, etc.)
      // For < (less than), it's usually setb (below) or seta (above) depending on operand order
      // The implementation uses setcc
      expect(asm).toMatch(/set[a-z]+/);
    });

    it("should generate float negation", () => {
      const input = `
        frame test() {
            local a: f64 = 1.0;
            local b: f64 = -a;
        }
      `;
      const asm = generate(input);

      // Should see xorpd (exclusive OR packed double) for negation
      expect(asm).toContain("xorpd");
      // Should see the mask loading we fixed
      // movss xmm1, [rel label] or similar for the mask
      // Since it's f64, it might be movsd or movq
      // The fix was specifically about loading the mask to a register first
      expect(asm).toMatch(/xorpd xmm0, xmm1/);
    });

    it("should generate mixed type operations", () => {
      const input = `
          frame test() {
              local a: f64 = 1.5;
              local b: u64 = 10;
              local c: f64 = a + b;
          }
        `;
      const asm = generate(input);

      // Should see conversion instruction cvtsi2sd (convert signed integer to scalar double)
      expect(asm).toContain("cvtsi2sd");
    });

    it("should generate f32 specific instructions", () => {
      const input = `
        frame test() {
            local a: f32 = 1.0;
            local b: f32 = 2.0;
            local c: f32 = a + b;
        }
      `;
      const asm = generate(input);

      // The current implementation promotes f32 to f64 for arithmetic
      // So we should see conversion instructions
      expect(asm).toContain("cvtss2sd"); // Convert single to double
      expect(asm).toContain("cvtsd2ss"); // Convert double to single
    });

    it("should generate float function calls", () => {
      const input = `
        frame add(a: f64, b: f64) ret f64 {
            return a + b;
        }
        frame main() {
            local res: f64 = call add(1.5, 2.5);
        }
      `;
      const asm = generate(input);

      // Arguments passed in xmm0, xmm1 for floats
      // We expect to see moves to xmm registers before call
      expect(asm).toContain("movsd xmm0");
      // Note: exact register allocation might vary, but xmm0 is standard for first float arg/return
      expect(asm).toContain("call func_add_");
    });

    it("should generate float array operations", () => {
      const input = `
        frame test() {
            local arr: f64[2];
            arr[0] = 1.0;
            local val: f64 = arr[0];
        }
      `;
      const asm = generate(input);

      // Should see movsd used for array element access
      expect(asm).toContain("movsd");
    });

    it("should generate struct float member access", () => {
      const input = `
            struct Point {
                x: f64,
                y: f64
            }
            frame test() {
                local p: Point;
                p.x = 1.0;
                local val: f64 = p.x;
            }
        `;
      const asm = generate(input);

      // Should see movsd used for struct member access
      expect(asm).toContain("movsd");
    });

    it("should generate complex float expressions", () => {
      const input = `
            frame test() {
                local a: f64 = 1.0;
                local b: f64 = 2.0;
                local c: f64 = 3.0;
                local res: f64 = a * b + c / a;
            }
        `;
      const asm = generate(input);

      expect(asm).toContain("mulsd");
      expect(asm).toContain("divsd");
      expect(asm).toContain("addsd");
    });

    it("should generate float return values", () => {
      const input = `
        frame get_pi() ret f64 {
            return 3.14;
        }
      `;
      const asm = generate(input);

      // Return value should be in xmm0
      expect(asm).toContain("movsd xmm0");
    });

    it("should generate mixed argument function calls", () => {
      const input = `
        frame mixed(a: u64, b: f64, c: u64, d: f64) {}
        frame main() {
            call mixed(1, 2.0, 3, 4.0);
        }
      `;
      const asm = generate(input);

      // The generator pushes args to stack then pops to registers
      // We verify that the correct registers are populated from the stack

      // 1 -> rdi
      expect(asm).toContain("pop rdi");

      // 2.0 -> xmm0
      // It pops to rax then moves to xmm0
      expect(asm).toContain("movq xmm0, rax");

      // 3 -> rsi
      expect(asm).toContain("pop rsi");

      // 4.0 -> xmm1
      expect(asm).toContain("movq xmm1, rax");

      expect(asm).toContain("call func_mixed_");
    });

    it("should generate control flow with float comparisons", () => {
      const input = `
        frame test() {
            local a: f64 = 1.0;
            if a > 0.0 {
                return;
            }
        }
      `;
      const asm = generate(input);

      expect(asm).toContain("ucomisd");
      // The generator evaluates condition to boolean (0/1) then jumps
      // So we expect setcc instruction
      expect(asm).toContain("seta"); // Set if above
    });

    it("should generate global float variable access", () => {
      const input = `
        global g: f64 = 3.14;
        frame test() {
            local l: f64 = g;
        }
      `;
      const asm = generate(input);

      // Should load from global label
      // It might use mov rax, [rel label] for simple moves
      expect(asm).toMatch(/mov rax, \[rel global_var_g\d+\]/);
    });

    it("should generate float pointer operations", () => {
      const input = `
        frame test() {
            local a: f64 = 1.0;
            local ptr: *f64 = &a;
            local b: f64 = *ptr;
        }
      `;
      const asm = generate(input);

      // Should see address loading and dereferencing
      expect(asm).toContain("lea"); // Load effective address
      expect(asm).toContain("movsd"); // Move scalar double
    });
  });
});
