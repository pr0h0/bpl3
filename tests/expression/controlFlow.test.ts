import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import BreakExpr from "../../parser/expression/breakExpr";
import ContinueExpr from "../../parser/expression/continueExpr";
import FunctionDeclarationExpr from "../../parser/expression/functionDeclaration";
import LoopExpr from "../../parser/expression/loopExpr";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("Control Flow Expressions", () => {
  it("should parse break statement", () => {
    const input = `
      frame main() {
        loop {
          break;
        }
      }
    `;
    const program = parse(input);
    const func = program.expressions[0] as FunctionDeclarationExpr;
    const loop = (func.body as any).expressions[0] as LoopExpr;
    const breakExpr = (loop.body as any).expressions[0] as BreakExpr;

    expect(breakExpr.type).toBe(ExpressionType.BreakExpression);
  });

  it("should parse continue statement", () => {
    const input = `
      frame main() {
        loop {
          continue;
        }
      }
    `;
    const program = parse(input);
    const func = program.expressions[0] as FunctionDeclarationExpr;
    const loop = (func.body as any).expressions[0] as LoopExpr;
    const continueExpr = (loop.body as any).expressions[0] as ContinueExpr;

    expect(continueExpr.type).toBe(ExpressionType.ContinueExpression);
  });
});
