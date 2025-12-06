import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import TokenType from "../../lexer/tokenType";
import UnaryExpr from "../../parser/expression/unaryExpr";
import VariableDeclarationExpr from "../../parser/expression/variableDeclarationExpr";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("UnaryExpr", () => {
  it("should parse unary negation", () => {
    const input = "local x: i64 = -1;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const unary = varDecl.value as UnaryExpr;

    expect(unary.type).toBe(ExpressionType.UnaryExpression);
    expect(unary.operator.type).toBe(TokenType.MINUS);
  });

  it("should parse logical not", () => {
    const input = "local x: u8 = !true;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const unary = varDecl.value as UnaryExpr;

    expect(unary.type).toBe(ExpressionType.UnaryExpression);
    expect(unary.operator.type).toBe(TokenType.NOT);
  });

  it("should parse address-of operator", () => {
    const input = "local ptr: *u64 = &var;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const unary = varDecl.value as UnaryExpr;

    expect(unary.type).toBe(ExpressionType.UnaryExpression);
    expect(unary.operator.type).toBe(TokenType.AMPERSAND);
  });

  it("should parse dereference operator", () => {
    const input = "local val: u64 = *ptr;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const unary = varDecl.value as UnaryExpr;

    expect(unary.type).toBe(ExpressionType.UnaryExpression);
    expect(unary.operator.type).toBe(TokenType.STAR);
  });
});
