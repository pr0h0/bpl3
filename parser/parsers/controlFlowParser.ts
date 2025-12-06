import type { IParser } from "../IParser";
import { CompilerError } from "../../errors";
import TokenType from "../../lexer/tokenType";
import BlockExpr from "../expression/blockExpr";
import BreakExpr from "../expression/breakExpr";
import ContinueExpr from "../expression/continueExpr";
import Expression from "../expression/expr";
import IfExpr from "../expression/ifExpr";
import LoopExpr from "../expression/loopExpr";
import NumberLiteralExpr from "../expression/numberLiteralExpr";
import ReturnExpr from "../expression/returnExpr";
import SwitchExpr, { type SwitchCase } from "../expression/switchExpr";

export class ControlFlowParser {
  constructor(private parser: IParser) {}

  parseLoopDeclaration(): LoopExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      const body = this.parser.parseCodeBlock();
      return new LoopExpr(body);
    });
  }

  parseIfExpression(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      const condition = this.parser.parseTernary();
      const thenBranch = this.parser.parseCodeBlock();

      let elseBranch: BlockExpr | null = null;
      if (
        this.parser.peek() &&
        this.parser.peek()!.type === TokenType.IDENTIFIER &&
        this.parser.peek()!.value === "else"
      ) {
        this.parser.consume(TokenType.IDENTIFIER);

        if (
          this.parser.peek() &&
          this.parser.peek()!.type === TokenType.IDENTIFIER &&
          this.parser.peek()!.value === "if"
        ) {
          const ifExpr = this.parseIfExpression();
          elseBranch = new BlockExpr([ifExpr]);
        } else {
          elseBranch = this.parser.parseCodeBlock();
        }
      }

      return new IfExpr(condition, thenBranch, elseBranch);
    });
  }

  parseSwitchExpression(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER); // consume 'switch'
      const discriminant = this.parser.parseTernary();
      this.parser.consume(
        TokenType.OPEN_BRACE,
        "Expected '{' after switch discriminant.",
      );

      const cases: SwitchCase[] = [];
      let defaultCase: BlockExpr | null = null;

      while (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.CLOSE_BRACE
      ) {
        const token = this.parser.peek()!;
        if (token.type === TokenType.IDENTIFIER && token.value === "case") {
          this.parser.consume(TokenType.IDENTIFIER);
          const valueExpr = this.parser.parsePrimary();
          if (!(valueExpr instanceof NumberLiteralExpr)) {
            throw new CompilerError(
              "Switch case value must be a number literal.",
              token.line,
            );
          }
          this.parser.consume(
            TokenType.COLON,
            "Expected ':' after case value.",
          );
          const body = this.parser.parseCodeBlock();
          cases.push({ value: valueExpr, body });
        } else if (
          token.type === TokenType.IDENTIFIER &&
          token.value === "default"
        ) {
          this.parser.consume(TokenType.IDENTIFIER);
          this.parser.consume(TokenType.COLON, "Expected ':' after default.");
          if (defaultCase) {
            throw new CompilerError(
              "Multiple default cases in switch.",
              token.line,
            );
          }
          defaultCase = this.parser.parseCodeBlock();
        } else {
          throw new CompilerError(
            "Expected 'case' or 'default' inside switch block.",
            token.line,
          );
        }
      }

      this.parser.consume(
        TokenType.CLOSE_BRACE,
        "Expected '}' after switch block.",
      );

      return new SwitchExpr(discriminant, cases, defaultCase);
    });
  }

  parseBreakExpr(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      return new BreakExpr();
    });
  }

  parseContinueExpr(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      return new ContinueExpr();
    });
  }

  parseFunctionReturn(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      let returnExpr: Expression | null = null;
      if (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.SEMICOLON
      ) {
        returnExpr = this.parser.parseTernary();
      }

      return new ReturnExpr(returnExpr);
    });
  }
}
