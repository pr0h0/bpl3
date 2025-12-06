import { describe, expect, it } from "bun:test";

import Lexer from "../lexer/lexer";
import TokenType from "../lexer/tokenType";
import BinaryExpr from "../parser/expression/binaryExpr";
import FunctionDeclarationExpr from "../parser/expression/functionDeclaration";
import IfExpr from "../parser/expression/ifExpr";
import LoopExpr from "../parser/expression/loopExpr";
import NumberLiteralExpr from "../parser/expression/numberLiteralExpr";
import StructDeclarationExpr from "../parser/expression/structDeclarationExpr";
import VariableDeclarationExpr from "../parser/expression/variableDeclarationExpr";
import ExpressionType from "../parser/expressionType";
import { Parser } from "../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("Parser", () => {
  describe("Variable Declarations", () => {
    it("should parse global variable declaration", () => {
      const program = parse("global x: u64 = 10;");
      // Expect VariableDeclaration + EOF
      expect(program.expressions.length).toBeGreaterThanOrEqual(1);
      const expr = program.expressions[0] as VariableDeclarationExpr;
      expect(expr.type).toBe(ExpressionType.VariableDeclaration);
      expect(expr.scope).toBe("global");
      expect(expr.name).toBe("x");
      expect(expr.varType.name).toBe("u64");
      expect(expr.value?.type).toBe(ExpressionType.NumberLiteralExpr);
    });

    it("should parse local variable declaration", () => {
      // Local vars usually inside functions, but parser allows them at top level (though validate() might complain later)
      // The parser itself doesn't enforce scope context strictly during parsing, only transpile/validate does.
      const program = parse("local y: *u8;");
      const expr = program.expressions[0] as VariableDeclarationExpr;
      expect(expr.scope).toBe("local");
      expect(expr.name).toBe("y");
      expect(expr.varType.name).toBe("u8");
      expect(expr.varType.isPointer).toBe(1);
      expect(expr.value).toBeNull();
    });

    it("should parse array declaration", () => {
      const program = parse("global arr: u32[10];");
      const expr = program.expressions[0] as VariableDeclarationExpr;
      expect(expr.varType.isArray).toEqual([10]);
    });
  });

  describe("Function Declarations", () => {
    it("should parse function declaration", () => {
      const input = `
        frame add(a: u64, b: u64) ret u64 {
            return a + b;
        }
      `;
      const program = parse(input);
      const expr = program.expressions[0] as FunctionDeclarationExpr;
      expect(expr.type).toBe(ExpressionType.FunctionDeclaration);
      expect(expr.name).toBe("add");
      expect(expr.args.length).toBe(2);
      expect(expr.args[0]!.name).toBe("a");
      expect(expr.args[0]!.type.name).toBe("u64");
      expect(expr.returnType?.name).toBe("u64");
    });

    it("should parse void function", () => {
      const input = `
        frame main() {
        }
      `;
      const program = parse(input);
      const expr = program.expressions[0] as FunctionDeclarationExpr;
      expect(expr.returnType).toBeNull();
    });
  });

  describe("Expressions", () => {
    it("should parse binary expression with precedence", () => {
      // 1 + 2 * 3 -> 1 + (2 * 3)
      const input = "global x: u64 = 1 + 2 * 3;";
      const program = parse(input);
      const varDecl = program.expressions[0] as VariableDeclarationExpr;
      const binaryExpr = varDecl.value as BinaryExpr;

      expect(binaryExpr.type).toBe(ExpressionType.BinaryExpression);
      expect(binaryExpr.operator.type).toBe(TokenType.PLUS);
      expect((binaryExpr.right as BinaryExpr).operator.type).toBe(
        TokenType.STAR,
      );
    });

    it("should parse function call", () => {
      const input = "local res: u64 = call add(1, 2);";
      const program = parse(input);
      const varDecl = program.expressions[0] as VariableDeclarationExpr;
      expect(varDecl.value?.type).toBe(ExpressionType.FunctionCall);
    });
  });

  describe("Control Flow", () => {
    it("should parse if statement", () => {
      const input = `
        frame test() {
            if x > 0 {
                return 1;
            } else {
                return 0;
            }
        }
      `;
      const program = parse(input);
      const func = program.expressions[0] as FunctionDeclarationExpr;
      // func.body is BlockExpr
      // body.expressions[0] is IfExpr
      const ifExpr = (func.body as any).expressions[0] as IfExpr;
      expect(ifExpr.type).toBe(ExpressionType.IfExpression);
      expect(ifExpr.elseBranch).not.toBeNull();
    });

    it("should parse loop", () => {
      const input = `
        frame test() {
            loop {
                break;
            }
        }
      `;
      const program = parse(input);
      const func = program.expressions[0] as FunctionDeclarationExpr;
      const loopExpr = (func.body as any).expressions[0] as LoopExpr;
      expect(loopExpr.type).toBe(ExpressionType.LoopExpression);
    });
  });

  describe("Structs", () => {
    it("should parse struct declaration", () => {
      const input = `
        struct Point {
            x: u64,
            y: u64
        }
      `;
      const program = parse(input);
      const expr = program.expressions[0] as StructDeclarationExpr;
      expect(expr.type).toBe(ExpressionType.StructureDeclaration);
      expect(expr.name).toBe("Point");
      expect(expr.fields.length).toBe(2);
    });
  });
});
