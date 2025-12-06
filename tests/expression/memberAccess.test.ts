import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import IdentifierExpr from "../../parser/expression/identifierExpr";
import MemberAccessExpr from "../../parser/expression/memberAccessExpr";
import VariableDeclarationExpr from "../../parser/expression/variableDeclarationExpr";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("MemberAccessExpr", () => {
  it("should parse struct member access", () => {
    const input = "local x: u64 = p.x;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const access = varDecl.value as MemberAccessExpr;

    expect(access.type).toBe(ExpressionType.MemberAccessExpression);
    expect((access.property as IdentifierExpr).name).toBe("x");
  });

  it("should parse array access", () => {
    const input = "local x: u64 = arr[0];";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;

    const access = varDecl.value as any;

    expect(access.type).toBe(ExpressionType.MemberAccessExpression);
  });
});
