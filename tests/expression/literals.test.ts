import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import NullLiteralExpr from "../../parser/expression/nullLiteralExpr";
import StringLiteralExpr from "../../parser/expression/stringLiteralExpr";
import VariableDeclarationExpr from "../../parser/expression/variableDeclarationExpr";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("Literal Expressions", () => {
  it("should parse null literal", () => {
    const input = "local x: *u8 = NULL;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const nullLit = varDecl.value as NullLiteralExpr;

    expect(nullLit.type).toBe(ExpressionType.NullLiteralExpr);
  });

  it("should parse string literal", () => {
    const input = 'local s: *u8 = "hello";';
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const strLit = varDecl.value as StringLiteralExpr;

    expect(strLit.type).toBe(ExpressionType.StringLiteralExpr);
    expect(strLit.value).toBe("hello");
  });

  it("should parse empty string literal", () => {
    const input = 'local s: *u8 = "";';
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const strLit = varDecl.value as StringLiteralExpr;

    expect(strLit.type).toBe(ExpressionType.StringLiteralExpr);
    expect(strLit.value).toBe("");
  });

  it("should parse string literal with escape sequences", () => {
    const input = 'local s: *u8 = "Line1\\nLine2\\tTabbed";';
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const strLit = varDecl.value as StringLiteralExpr;

    expect(strLit.type).toBe(ExpressionType.StringLiteralExpr);
    expect(strLit.value).toBe("Line1\\nLine2\\tTabbed");
  });

  it("should parse number literal in base 10", () => {
    const input = "local n: u64 = 12345;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const numLit = varDecl.value;

    expect(numLit!.type).toBe(ExpressionType.NumberLiteralExpr);
    expect((numLit as any).value).toBe("12345");
  });

  it("should parse number literal in base 16", () => {
    const input = "local n: u64 = 0x1A2B3C;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const numLit = varDecl.value;

    expect(numLit!.type).toBe(ExpressionType.NumberLiteralExpr);
    expect((numLit as any).value).toBe("0x1a2b3c");
  });

  it("should parse number literal in base 2", () => {
    const input = "local n: u64 = 0b1101;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const numLit = varDecl.value;

    expect(numLit!.type).toBe(ExpressionType.NumberLiteralExpr);
    expect((numLit as any).value).toBe("0xd");
  });

  it("should parse number literal in base 8", () => {
    const input = "local n: u64 = 0o17;";
    const program = parse(input);
    const varDecl = program.expressions[0] as VariableDeclarationExpr;
    const numLit = varDecl.value;

    expect(numLit!.type).toBe(ExpressionType.NumberLiteralExpr);
    expect((numLit as any).value).toBe("0xf");
  });
});
