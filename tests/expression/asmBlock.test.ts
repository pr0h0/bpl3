import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import TokenType from "../../lexer/tokenType";
import AsmBlockExpr from "../../parser/expression/asmBlockExpr";
import FunctionDeclarationExpr from "../../parser/expression/functionDeclaration";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("AsmBlockExpr", () => {
  it("should parse asm block", () => {
    const input = `
      frame main() {
        asm {
          mov rax, 1
          syscall
        }
      }
    `;
    const program = parse(input);
    const func = program.expressions[0] as FunctionDeclarationExpr;
    const asmBlock = (func.body as any).expressions[0] as AsmBlockExpr;

    expect(asmBlock.type).toBe(ExpressionType.AsmBlockExpression);
    expect(asmBlock.code.length).toBe(5);
    expect(asmBlock.code[0]?.type).toBe(TokenType.IDENTIFIER);
    expect(asmBlock.code[0]?.value).toBe("mov");
  });
});
