import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import Expression from "../../parser/expression/expr";
import TernaryExpr from "../../parser/expression/ternaryExpr";
import VariableDeclarationExpr from "../../parser/expression/variableDeclarationExpr";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("TernaryExpr", () => {
  it("should parse ternary expression", () => {
    const input = "local x: u64 = true ? 1 : 0;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const ternary = varDecl.value as TernaryExpr;

    expect(ternary.type).toBe(ExpressionType.TernaryExpression);
    expect(ternary.condition).not.toBeNull();
    expect(ternary.condition).toBeInstanceOf(Expression);

    expect(ternary.trueExpr).toBeInstanceOf(Expression);
    expect(ternary.falseExpr).toBeInstanceOf(Expression);

    expect(ternary.trueExpr).not.toBeNull();
    expect(ternary.falseExpr).not.toBeNull();
  });

  it("should parse nested ternary expressions", () => {
    const input = "local x: u64 = cond1 ? cond2 ? 1 : 2 : 3;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const ternary = varDecl.value as TernaryExpr;

    expect(ternary.type).toBe(ExpressionType.TernaryExpression);
    expect(ternary.condition).not.toBeNull();
    expect(ternary.condition).toBeInstanceOf(Expression);

    const nestedTernary = ternary.trueExpr as TernaryExpr;
    expect(nestedTernary.type).toBe(ExpressionType.TernaryExpression);
    expect(nestedTernary.condition).not.toBeNull();
    expect(nestedTernary.condition).toBeInstanceOf(Expression);

    expect(nestedTernary.trueExpr).not.toBeNull();
    expect(nestedTernary.falseExpr).not.toBeNull();
  });
});
