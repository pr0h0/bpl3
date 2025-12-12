import type { IParser } from "../IParser";
import { CompilerError } from "../../errors";
import TokenType from "../../lexer/tokenType";
import BlockExpr from "../expression/blockExpr";
import BreakExpr from "../expression/breakExpr";
import ContinueExpr from "../expression/continueExpr";
import DeferExpr from "../expression/deferExpr";
import Expression from "../expression/expr";
import IfExpr from "../expression/ifExpr";
import LoopExpr from "../expression/loopExpr";
import NumberLiteralExpr from "../expression/numberLiteralExpr";
import ReturnExpr from "../expression/returnExpr";
import SwitchExpr, { type SwitchCase } from "../expression/switchExpr";
import TryExpr, { type CatchBlock } from "../expression/tryExpr";
import ThrowExpr from "../expression/throwExpr";

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

  parseTryExpression(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.TRY);
      const tryBlock = this.parser.parseCodeBlock();
      const catchBlocks: CatchBlock[] = [];

      while (this.parser.match(TokenType.CATCH)) {
        this.parser.consume(TokenType.OPEN_PAREN);
        const variableName = this.parser.consume(TokenType.IDENTIFIER).value;
        this.parser.consume(TokenType.COLON);
        const variableType = this.parser.parseType();
        this.parser.consume(TokenType.CLOSE_PAREN);
        const block = this.parser.parseCodeBlock();
        catchBlocks.push({ variableName, variableType, block });
      }

      if (catchBlocks.length === 0) {
        throw new CompilerError(
          "Expected at least one catch block after try.",
          this.parser.peek()?.line || 0,
        );
      }

      return new TryExpr(tryBlock, catchBlocks);
    });
  }

  parseThrowExpression(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.THROW);
      const expr = this.parser.parseAssignment();
      return new ThrowExpr(expr);
    });
  }

  /**
   * Parses a defer statement.
   *
   * Syntax:
   *   defer { <statements> }
   *   defer <single_statement>;
   *
   * The deferred code will be executed when the enclosing function exits,
   * in reverse order of declaration (LIFO - Last In, First Out).
   *
   * Examples:
   *   defer { call cleanup(); }
   *   defer { call fclose(file); }
   *
   * @returns A DeferExpr containing the deferred code block
   */
  parseDeferExpression(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER); // consume 'defer'

      // Defer requires a block: defer { ... }
      if (
        this.parser.peek() &&
        this.parser.peek()!.type === TokenType.OPEN_BRACE
      ) {
        const body = this.parser.parseCodeBlock();
        return new DeferExpr(body);
      }

      // Error: defer must be followed by a block
      throw new CompilerError(
        "defer must be followed by a block: defer { ... }",
        this.parser.peek()?.line || 0,
      );
    });
  }
}
