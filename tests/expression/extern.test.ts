import { describe, it, expect } from "bun:test";
import Lexer from "../../lexer/lexer";
import { Parser } from "../../parser/parser";
import ExpressionType from "../../parser/expressionType";
import ExternDeclarationExpr from "../../parser/expression/externDeclarationExpr";
import AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";

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
  program.transpile(gen, scope);
  return gen.build();
}

describe("Extern Declaration", () => {
  describe("Parser", () => {
    it("should parse simple extern declaration", () => {
      const input = "extern printf(fmt: *u8);";
      const program = parse(input);
      const expr = program.expressions[0] as ExternDeclarationExpr;

      expect(expr.type).toBe(ExpressionType.ExternDeclaration);
      expect(expr.name).toBe("printf");
      expect(expr.args.length).toBe(1);
      expect(expr.args[0]!.name).toBe("fmt");
      expect(expr.args[0]!.type.name).toBe("u8");
      expect(expr.args[0]!.type.isPointer).toBe(1);
      expect(expr.returnType).toBeNull();
    });

    it("should parse extern declaration with return type", () => {
      const input = "extern malloc(size: u64) ret *u8;";
      const program = parse(input);
      const expr = program.expressions[0] as ExternDeclarationExpr;

      expect(expr.type).toBe(ExpressionType.ExternDeclaration);
      expect(expr.name).toBe("malloc");
      expect(expr.args.length).toBe(1);
      expect(expr.returnType).not.toBeNull();
      expect(expr.returnType?.name).toBe("u8");
      expect(expr.returnType?.isPointer).toBe(1);
    });

    it("should parse extern declaration with multiple arguments", () => {
      const input = "extern my_func(a: u64, b: u64, c: *u8);";
      const program = parse(input);
      const expr = program.expressions[0] as ExternDeclarationExpr;

      expect(expr.args.length).toBe(3);
      expect(expr.args[0]!.name).toBe("a");
      expect(expr.args[1]!.name).toBe("b");
      expect(expr.args[2]!.name).toBe("c");
    });
  });

  describe("Transpiler", () => {
    it("should update scope with extern definition", () => {
      // Note: extern requires the function to be imported first or exist in scope?
      // Looking at ExternDeclarationExpr.ts:
      // const existingFunc = scope.resolveFunction(this.name);
      // if (!existingFunc || !existingFunc.isExternal) { throw ... }
      
      // So we must import it first.
      const input = `
        import printf from "libc";
        extern printf(fmt: *u8);
      `;
      
      // We can't easily inspect the scope after generation with the helper function,
      // but if it doesn't throw, it means it worked.
      // And we can check if calls use the correct signature?
      // Actually, the generator doesn't use the signature for validation yet, 
      // but the scope update is what we care about.
      
      expect(() => generate(input)).not.toThrow();
    });

    it("should throw if extern is used without import", () => {
      const input = "extern unknown_func(a: u64);";
      expect(() => generate(input)).toThrow();
    });
  });
});
