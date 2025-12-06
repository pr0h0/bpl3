import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import BlockExpr from "../../parser/expression/blockExpr";
import FunctionDeclarationExpr from "../../parser/expression/functionDeclaration";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("BlockExpr", () => {
  it("should parse nested blocks", () => {
    const input = `
      frame main() {
        local x: u64 = 1;
      }
    `;
    const program = parse(input);
    const func = program.expressions[0] as FunctionDeclarationExpr;
    const outerBlock = func.body as BlockExpr;

    expect(outerBlock.type).toBe(ExpressionType.BlockExpression);
    expect(outerBlock.expressions.length).toBe(1);
    expect(outerBlock.expressions[0]?.type).toBe(
      ExpressionType.VariableDeclaration,
    );
  });
});
