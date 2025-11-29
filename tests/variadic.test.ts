import { describe, it, expect } from "bun:test";
import Lexer from "../lexer/lexer";
import { Parser } from "../parser/parser";
import TokenType from "../lexer/tokenType";
import ExpressionType from "../parser/expressionType";
import ExternDeclarationExpr from "../parser/expression/externDeclarationExpr";
import FunctionDeclarationExpr from "../parser/expression/functionDeclaration";
import MemberAccessExpr from "../parser/expression/memberAccessExpr";
import IdentifierExpr from "../parser/expression/identifierExpr";
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

describe("Variadic Functions", () => {
  describe("Lexer", () => {
    it("should tokenize ellipsis", () => {
      const input = "...";
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      expect(tokens[0]!.type).toBe(TokenType.ELLIPSIS);
    });

    it("should tokenize ellipsis in function signature", () => {
      const input = "frame foo(a: u64, ...:u64)";
      const lexer = new Lexer(input);
      const tokens = lexer.tokenize();
      // frame, foo, (, a, :, u64, ,, ..., :, u64, )
      const ellipsisToken = tokens.find((t) => t.type === TokenType.ELLIPSIS);
      expect(ellipsisToken).toBeDefined();
    });
  });

  describe("Parser", () => {
    it("should parse extern variadic declaration", () => {
      const input = "extern printf(fmt: *u8, ...);";
      const program = parse(input);
      const expr = program.expressions[0] as ExternDeclarationExpr;
      expect(expr.type).toBe(ExpressionType.ExternDeclaration);
      expect(expr.name).toBe("printf");
      expect(expr.isVariadic).toBe(true);
    });

    it("should parse user-defined variadic function", () => {
      const input = "frame sum(count: u64, ...:u64) ret u64 { return 0; }";
      const program = parse(input);
      const expr = program.expressions[0] as FunctionDeclarationExpr;
      expect(expr.type).toBe(ExpressionType.FunctionDeclaration);
      expect(expr.name).toBe("sum");
      expect(expr.isVariadic).toBe(true);
      expect(expr.variadicType?.name).toBe("u64");
    });

    it("should fail if variadic arg is not last", () => {
      const input = "frame foo(...:u64, a: u64) {}";
      expect(() => parse(input)).toThrow();
    });

    it("should parse args access", () => {
      const input = `
        frame sum(count: u64, ...:u64) {
            local x: u64 = args[0];
        }
      `;
      const program = parse(input);
      const func = program.expressions[0] as FunctionDeclarationExpr;
      // body -> VariableDeclaration -> value (MemberAccess)
      const varDecl = (func.body as any).expressions[0];
      const value = varDecl.value as MemberAccessExpr;
      expect(value.type).toBe(ExpressionType.MemberAccessExpression);
      expect((value.object as IdentifierExpr).name).toBe("args");
      expect(value.isIndexAccess).toBe(true);
    });
  });

  describe("Generator", () => {
    it("should generate spill code for variadic function", () => {
      const input = "frame sum(count: u64, ...:u64) {}";
      const asm = generate(input);
      // Should see sub rsp to allocate space for spilled registers
      // And mov instructions to save registers to stack
      expect(asm).toContain("sub rsp,");
      expect(asm).toContain("mov [rbp -");
    });

    it("should generate correct code for args access", () => {
      const input = `
        frame sum(count: u64, ...:u64) {
            local x: u64 = args[0];
        }
      `;
      const asm = generate(input);
      // Should see check for register vs stack
      expect(asm).toContain("cmp rax,"); // Check index against reg count
      expect(asm).toContain("jge"); // Jump if stack
      // Register access logic
      expect(asm).toContain("imul rbx, 8");
      // Stack access logic
      expect(asm).toContain("add rax, 16");
    });
  });
});
