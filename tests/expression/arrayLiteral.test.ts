import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import ArrayLiteralExpr from "../../parser/expression/arrayLiteralExpr";
import VariableDeclarationExpr from "../../parser/expression/variableDeclarationExpr";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("ArrayLiteralExpr", () => {
  it("should parse simple array literal", () => {
    const input = "global arr: u64[3] = [1, 2, 3];";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const arrayLit = varDecl.value as ArrayLiteralExpr;

    expect(arrayLit.type).toBe(ExpressionType.ArrayLiteralExpr);
    expect(arrayLit.elements.length).toBe(3);
    expect(arrayLit.elements[0]?.type).toBe(ExpressionType.NumberLiteralExpr);
  });

  it("should parse nested array literal", () => {
    const input = "global mat: u64[2][2] = [[1, 2], [3, 4]];";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const arrayLit = varDecl.value as ArrayLiteralExpr;

    expect(arrayLit.elements.length).toBe(2);
    const inner = arrayLit.elements[0] as ArrayLiteralExpr;
    expect(inner.type).toBe(ExpressionType.ArrayLiteralExpr);
    expect(inner.elements.length).toBe(2);
  });
});
