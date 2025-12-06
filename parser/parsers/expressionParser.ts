import type { IParser } from "../IParser";
import { CompilerError } from "../../errors";
import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import ArrayLiteralExpr from "../expression/arrayLiteralExpr";
import AsmBlockExpr from "../expression/asmBlockExpr";
import BinaryExpr from "../expression/binaryExpr";
import BlockExpr from "../expression/blockExpr";
import CastExpr from "../expression/castExpr";
import EOFExpr from "../expression/EOFExpr";
import Expression from "../expression/expr";
import FunctionCallExpr from "../expression/functionCallExpr";
import FunctionDeclarationExpr from "../expression/functionDeclaration";
import IdentifierExpr from "../expression/identifierExpr";
import IfExpr from "../expression/ifExpr";
import LoopExpr from "../expression/loopExpr";
import MemberAccessExpr from "../expression/memberAccessExpr";
import MethodCallExpr from "../expression/methodCallExpr";
import NullLiteral from "../expression/nullLiteralExpr";
import NumberLiteralExpr from "../expression/numberLiteralExpr";
import { SizeofExpr } from "../expression/sizeofExpr";
import StringLiteralExpr from "../expression/stringLiteralExpr";
import StructLiteralExpr from "../expression/structLiteralExpr";
import SwitchExpr from "../expression/switchExpr";
import TernaryExpr from "../expression/ternaryExpr";
import UnaryExpr from "../expression/unaryExpr";

import type { VariableType } from "../expression/variableDeclarationExpr";

export class ExpressionParser {
  constructor(private parser: IParser) {}

  parseExpression(): Expression {
    return this.parser.withRange(() => {
      const expr = this.parseAssignment();

      if (expr.requiresSemicolon) {
        this.parser.consume(
          TokenType.SEMICOLON,
          "Expected ';' after expression.",
        );
      }

      return expr;
    });
  }

  parseAssignment(): Expression {
    return this.parser.withRange(() => {
      const expr = this.parseTernary();
      const nextToken = this.parser.peek();

      if (
        [
          TokenType.ASSIGN,
          TokenType.PLUS_ASSIGN,
          TokenType.MINUS_ASSIGN,
          TokenType.STAR_ASSIGN,
          TokenType.SLASH_ASSIGN,
          TokenType.PERCENT_ASSIGN,
          TokenType.AMPERSAND_ASSIGN,
          TokenType.PIPE_ASSIGN,
          TokenType.CARET_ASSIGN,
        ].includes(nextToken?.type!)
      ) {
        const operator = this.parser.consume(nextToken!.type);
        const right = this.parseTernary();

        return new BinaryExpr(expr, operator, right);
      }
      return expr;
    });
  }

  parseTernary(): Expression {
    return this.parser.withRange(() => {
      const expr = this.parseLogicalOr();
      const nextToken = this.parser.peek();

      if (nextToken?.type === TokenType.QUESTION) {
        this.parser.consume(TokenType.QUESTION);
        const middle = this.parseTernary();
        this.parser.consume(TokenType.COLON);
        const right = this.parseTernary();

        return new TernaryExpr(expr, middle, right);
      }

      return expr;
    });
  }

  parseLogicalOr(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseLogicalAnd();
      let nextToken = this.parser.peek();

      while (nextToken?.type === TokenType.OR) {
        this.parser.consume(nextToken.type);
        const right = this.parseLogicalAnd();

        expr = new BinaryExpr(expr, nextToken, right);

        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseLogicalAnd(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseBitwiseOr();
      let nextToken = this.parser.peek();

      while (nextToken?.type === TokenType.AND) {
        this.parser.consume(nextToken.type);
        const right = this.parseBitwiseOr();

        expr = new BinaryExpr(expr, nextToken, right);

        nextToken = this.parser.peek();
      }
      return expr;
    });
  }

  parseBitwiseOr(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseBitwiseXor();
      let nextToken = this.parser.peek();

      while (nextToken?.type === TokenType.PIPE) {
        const operator = this.parser.consume(nextToken.type);

        const right = this.parseBitwiseXor();

        expr = new BinaryExpr(expr, operator, right);

        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseBitwiseXor(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseBitwiseAnd();
      let nextToken = this.parser.peek();

      while (nextToken?.type === TokenType.CARET) {
        const operator = this.parser.consume(nextToken.type);

        const right = this.parseBitwiseAnd();

        expr = new BinaryExpr(expr, operator, right);
        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseBitwiseAnd(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseEquality();
      let nextToken = this.parser.peek();

      while (nextToken?.type === TokenType.AMPERSAND) {
        if (
          this.isBlockExpr(expr) &&
          nextToken.line > (expr.endToken?.line || 0)
        ) {
          break;
        }
        const operator = this.parser.consume(nextToken.type);

        const right = this.parseEquality();

        expr = new BinaryExpr(expr, operator, right);

        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseEquality(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseComparison();
      let nextToken = this.parser.peek();

      while (
        nextToken?.type === TokenType.EQUAL ||
        nextToken?.type === TokenType.NOT_EQUAL
      ) {
        const operator = this.parser.consume(nextToken.type);
        const right = this.parseComparison();

        expr = new BinaryExpr(expr, operator, right);
        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseComparison(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseBitwiseShift();
      let nextToken = this.parser.peek();

      while (
        nextToken?.type === TokenType.GREATER_THAN ||
        nextToken?.type === TokenType.LESS_THAN ||
        nextToken?.type === TokenType.GREATER_EQUAL ||
        nextToken?.type === TokenType.LESS_EQUAL
      ) {
        const operator = this.parser.consume(nextToken.type);
        const right = this.parseBitwiseShift();

        expr = new BinaryExpr(expr, operator, right);
        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseBitwiseShift(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseAddition();
      let nextToken = this.parser.peek();

      while (
        nextToken?.type === TokenType.BITSHIFT_LEFT ||
        nextToken?.type === TokenType.BITSHIFT_RIGHT
      ) {
        const operator = this.parser.consume(nextToken.type);
        const right = this.parseAddition();

        expr = new BinaryExpr(expr, operator, right);

        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseAddition(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseMultiplication();
      let nextToken = this.parser.peek();

      while (
        nextToken?.type === TokenType.PLUS ||
        nextToken?.type === TokenType.MINUS
      ) {
        if (
          this.isBlockExpr(expr) &&
          nextToken.line > (expr.endToken?.line || 0)
        ) {
          break;
        }
        const operator = this.parser.consume(nextToken.type);
        const right = this.parseMultiplication();

        expr = new BinaryExpr(expr, operator, right);
        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseMultiplication(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseUnary();
      let nextToken = this.parser.peek();

      while (
        nextToken?.type === TokenType.STAR ||
        nextToken?.type === TokenType.SLASH ||
        nextToken?.type === TokenType.PERCENT ||
        nextToken?.type === TokenType.SLASH_SLASH
      ) {
        if (
          this.isBlockExpr(expr) &&
          nextToken.line > (expr.endToken?.line || 0)
        ) {
          break;
        }
        const operator = this.parser.consume(nextToken.type);
        const right = this.parseUnary();

        expr = new BinaryExpr(expr, operator, right);
        nextToken = this.parser.peek();
      }

      return expr;
    });
  }

  parseUnary(): Expression {
    return this.parser.withRange(() => {
      const nextToken = this.parser.peek();
      if (!nextToken)
        throw new CompilerError(
          "Unexpected end of input on unary parse",
          this.parser.peek(0)?.line || 0,
        );

      if (
        [
          TokenType.MINUS,
          TokenType.PLUS,
          TokenType.NOT,
          TokenType.TILDE,
          TokenType.STAR,
          TokenType.AMPERSAND,
        ].includes(nextToken.type)
      ) {
        const operator = this.parser.consume(nextToken.type);
        const right = this.parseUnary();
        return new UnaryExpr(operator, right);
      }

      return this.parsePostfix();
    });
  }

  parsePostfix(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseGrouping();

      while (true) {
        if (this.parser.peek()?.type === TokenType.DOT) {
          this.parser.consume(TokenType.DOT);
          const propertyToken = this.parser.consume(
            TokenType.IDENTIFIER,
            "Expected property name after '.'.",
          );
          const accessExpr = new IdentifierExpr(propertyToken.value);

          expr = new MemberAccessExpr(expr, accessExpr, false);
        } else if (this.parser.peek()?.type === TokenType.OPEN_BRACKET) {
          this.parser.consume(TokenType.OPEN_BRACKET);

          const indexExpr = this.parseTernary();

          this.parser.consume(
            TokenType.CLOSE_BRACKET,
            "Expected ']' after index expression.",
          );

          expr = new MemberAccessExpr(expr, indexExpr, true);
        } else {
          break;
        }
      }

      return expr;
    });
  }

  parseGrouping(): Expression {
    return this.parser.withRange(() => {
      const nextToken = this.parser.peek();
      if (!nextToken)
        throw new CompilerError(
          "Unexpected end of input",
          this.parser.peek(-1)?.line || 0,
        );

      if (nextToken.type === TokenType.OPEN_PAREN) {
        this.parser.consume(TokenType.OPEN_PAREN);
        const expr = this.parseTernary();
        this.parser.consume(
          TokenType.CLOSE_PAREN,
          "Expected ')' after expression.",
        );

        return expr;
      }

      return this.parsePrimary();
    });
  }

  parsePrimary(): Expression {
    return this.parser.withRange(() => {
      const token = this.parser.peek();
      if (!token)
        throw new CompilerError(
          "Unexpected end of input",
          this.parser.peek(-1)?.line || 0,
        );

      switch (token.type) {
        case TokenType.IDENTIFIER:
          return this.parseIdentifier();
        case TokenType.NUMBER_LITERAL:
          const numberToken = this.parser.consume(TokenType.NUMBER_LITERAL);
          return new NumberLiteralExpr(numberToken.value, numberToken);
        case TokenType.STRING_LITERAL:
          const stringToken = this.parser.consume(TokenType.STRING_LITERAL);
          return new StringLiteralExpr(stringToken.value, stringToken);
        case TokenType.OPEN_BRACKET:
          return this.parseArrayLiteral();
        case TokenType.OPEN_BRACE:
          return this.parseStructLiteral();
        case TokenType.SIZEOF:
          return this.parseSizeofExpression();
        case TokenType.EOF:
          this.parser.consume(TokenType.EOF);
          return new EOFExpr();
      }

      throw new CompilerError(`Unexpected token: ${token.type}`, token.line);
    });
  }

  parseIdentifier(): Expression {
    return this.parser.withRange(() => {
      const token = this.parser.peek()!;
      switch (token.value) {
        case "global":
        case "local":
          return this.parser.parseVariableDeclaration();
        case "frame":
          return this.parser.parseFunctionDeclaration();
        case "loop":
          return this.parser.parseLoopDeclaration();
        case "asm":
          return this.parseAsmBlock();
        case "if":
          return this.parser.parseIfExpression();
        case "switch":
          return this.parser.parseSwitchExpression();
        case "struct":
          return this.parser.parseStructDeclaration();
        case "call":
          return this.parseFunctionCall();
        case "return":
          return this.parser.parseFunctionReturn();
        case "break":
          return this.parser.parseBreakExpr();
        case "continue":
          return this.parser.parseContinueExpr();
        case "import":
          return this.parser.parseImportExpression();
        case "export":
          return this.parser.parseExportExpression();
        case "extern":
          return this.parser.parseExternDeclaration();
        case "cast":
          return this.parseCastExpression();
        case "NULL":
          this.parser.consume(TokenType.IDENTIFIER);
          return new NullLiteral();
        default:
          const identifierToken = this.parser.consume(TokenType.IDENTIFIER);
          return new IdentifierExpr(identifierToken.value);
      }
    });
  }

  parseArguments(): Expression[] {
    const args: Expression[] = [];
    while (
      this.parser.peek() &&
      this.parser.peek()!.type !== TokenType.CLOSE_PAREN
    ) {
      const argExpr = this.parseTernary();
      args.push(argExpr);

      if (
        this.parser.peek()?.type !== TokenType.CLOSE_PAREN &&
        this.parser.peek()?.type !== TokenType.COMMA
      ) {
        throw new CompilerError(
          "Expected ',' or ')' after function argument",
          this.parser.peek()?.line || 0,
        );
      }
      if (this.parser.peek() && this.parser.peek()!.type === TokenType.COMMA) {
        this.parser.consume(TokenType.COMMA);
      }
    }
    return args;
  }

  parseFunctionCall(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER); // consume 'call'

      // Parse the receiver expression, stopping before a method call pattern
      // (DOT followed by IDENTIFIER and OPEN_PAREN)
      let potentialReceiver = this.parseReceiverChain();

      // Loop to handle chained method calls
      while (this.parser.peek()?.type === TokenType.DOT) {
        this.parser.consume(TokenType.DOT);
        const methodNameToken = this.parser.consume(
          TokenType.IDENTIFIER,
          "Expected method name after '.'",
        );

        // Parse generic type arguments if present
        const genericArgs: VariableType[] = [];
        if (this.parser.peek()?.type === TokenType.LESS_THAN) {
          this.parser.consume(TokenType.LESS_THAN);

          do {
            const typeArg = this.parser.parseType();
            genericArgs.push(typeArg);

            if (this.parser.peek()?.type === TokenType.COMMA) {
              this.parser.consume(TokenType.COMMA);
            } else if (this.parser.peek()?.type === TokenType.GREATER_THAN) {
              break;
            } else {
              throw new CompilerError(
                "Expected ',' or '>' in generic type argument list",
                this.parser.peek()?.line || 0,
              );
            }
          } while (true);

          this.parser.consume(
            TokenType.GREATER_THAN,
            "Expected '>' after generic type arguments",
          );
        }

        this.parser.consume(
          TokenType.OPEN_PAREN,
          "Expected '(' after method name.",
        );

        const args = this.parseArguments();

        this.parser.consume(
          TokenType.CLOSE_PAREN,
          "Expected ')' after method call arguments.",
        );

        potentialReceiver = new MethodCallExpr(
          potentialReceiver,
          methodNameToken.value,
          args,
          genericArgs,
        );
      }

      // If it was a method call (or chain), return it
      if (potentialReceiver instanceof MethodCallExpr) {
        return potentialReceiver;
      }

      // Otherwise it's a regular function call
      // potentialReceiver should be an IdentifierExpr with the function name
      if (!(potentialReceiver instanceof IdentifierExpr)) {
        throw new CompilerError(
          "Expected function name after 'call'",
          this.parser.peek()?.line || 0,
        );
      }

      // Parse generic type arguments if present
      const genericArgs: VariableType[] = [];
      if (this.parser.peek()?.type === TokenType.LESS_THAN) {
        this.parser.consume(TokenType.LESS_THAN);

        do {
          const typeArg = this.parser.parseType();
          genericArgs.push(typeArg);

          if (this.parser.peek()?.type === TokenType.COMMA) {
            this.parser.consume(TokenType.COMMA);
          } else if (this.parser.peek()?.type === TokenType.GREATER_THAN) {
            break;
          } else {
            throw new CompilerError(
              "Expected ',' or '>' in generic type argument list",
              this.parser.peek()?.line || 0,
            );
          }
        } while (true);

        this.parser.consume(
          TokenType.GREATER_THAN,
          "Expected '>' after generic type arguments",
        );
      }

      this.parser.consume(
        TokenType.OPEN_PAREN,
        "Expected '(' after 'call' function name.",
      );

      const args = this.parseArguments();

      this.parser.consume(
        TokenType.CLOSE_PAREN,
        "Expected ')' after function call arguments.",
      );

      return new FunctionCallExpr(potentialReceiver.name, args, genericArgs);
    });
  }

  parseReceiverChain(): Expression {
    return this.parser.withRange(() => {
      let expr = this.parseGrouping();

      while (true) {
        // Check if we're at a method call pattern: .identifier( OR .identifier<
        if (
          this.parser.peek()?.type === TokenType.DOT &&
          this.parser.peek(1)?.type === TokenType.IDENTIFIER &&
          (this.parser.peek(2)?.type === TokenType.OPEN_PAREN ||
            this.parser.peek(2)?.type === TokenType.LESS_THAN)
        ) {
          // Stop here - this is the method call
          break;
        }

        if (this.parser.peek()?.type === TokenType.DOT) {
          this.parser.consume(TokenType.DOT);
          const propertyToken = this.parser.consume(
            TokenType.IDENTIFIER,
            "Expected property name after '.'.",
          );
          const accessExpr = new IdentifierExpr(propertyToken.value);

          expr = new MemberAccessExpr(expr, accessExpr, false);
        } else if (this.parser.peek()?.type === TokenType.OPEN_BRACKET) {
          this.parser.consume(TokenType.OPEN_BRACKET);

          const indexExpr = this.parseTernary();

          this.parser.consume(
            TokenType.CLOSE_BRACKET,
            "Expected ']' after index expression.",
          );

          expr = new MemberAccessExpr(expr, indexExpr, true);
        } else {
          break;
        }
      }

      return expr;
    });
  }

  parseAsmBlock(): AsmBlockExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      this.parser.consume(TokenType.OPEN_BRACE, "Expected '{' after 'asm'.");

      const asmCodeTokens: Token[] = [];
      while (this.parser.peek()?.type !== TokenType.CLOSE_BRACE) {
        asmCodeTokens.push(this.parser.consume(this.parser.peek()!.type));
      }

      this.parser.consume(
        TokenType.CLOSE_BRACE,
        "Expected '}' after asm code block.",
      );

      return new AsmBlockExpr(asmCodeTokens);
    });
  }

  parseStructLiteral(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.OPEN_BRACE, "Expected '{'");
      const fields: { fieldName?: string; value: Expression }[] = [];

      if (!this.parser.check(TokenType.CLOSE_BRACE)) {
        do {
          // Check if it's a named field: identifier : expression
          if (
            this.parser.check(TokenType.IDENTIFIER) &&
            this.parser.peek(1)?.type === TokenType.COLON
          ) {
            const name = this.parser.consume(
              TokenType.IDENTIFIER,
              "Expected field name",
            ).value;
            this.parser.consume(TokenType.COLON, "Expected ':'");
            const value = this.parseTernary();
            fields.push({ fieldName: name, value });
          } else {
            // Positional argument
            const value = this.parseTernary();
            fields.push({ value });
          }
        } while (this.parser.match(TokenType.COMMA));
      }

      this.parser.consume(TokenType.CLOSE_BRACE, "Expected '}'");
      return new StructLiteralExpr(fields);
    });
  }

  parseCastExpression(): CastExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER); // consume 'cast'
      this.parser.consume(TokenType.LESS_THAN, "Expected '<' after 'cast'");

      const targetType = this.parser.parseType();

      this.parser.consume(TokenType.GREATER_THAN, "Expected '>' after type");
      this.parser.consume(
        TokenType.OPEN_PAREN,
        "Expected '(' after cast<Type>",
      );

      const value = this.parseTernary();

      this.parser.consume(
        TokenType.CLOSE_PAREN,
        "Expected ')' after cast expression",
      );

      return new CastExpr(targetType, value);
    });
  }

  parseSizeofExpression(): Expression {
    return this.parser.withRange(() => {
      const token = this.parser.consume(TokenType.SIZEOF);
      this.parser.consume(TokenType.OPEN_PAREN, "Expected '(' after 'sizeof'");
      const type = this.parser.parseType();
      this.parser.consume(TokenType.CLOSE_PAREN, "Expected ')' after type");
      return new SizeofExpr(type, token);
    });
  }

  parseArrayLiteral(): Expression {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.OPEN_BRACKET);
      const elements: Expression[] = [];

      while (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.CLOSE_BRACKET
      ) {
        const element = this.parseTernary();
        elements.push(element);

        if (
          this.parser.peek()?.type !== TokenType.CLOSE_BRACKET &&
          this.parser.peek()?.type !== TokenType.COMMA
        ) {
          throw new CompilerError(
            "Expected ',' or ']' after array element",
            this.parser.peek()?.line || 0,
          );
        }

        if (
          this.parser.peek() &&
          this.parser.peek()!.type === TokenType.COMMA
        ) {
          this.parser.consume(TokenType.COMMA);
        }
      }

      this.parser.consume(
        TokenType.CLOSE_BRACKET,
        "Expected ']' after array literal.",
      );

      return new ArrayLiteralExpr(elements);
    });
  }

  private isBlockExpr(expr: Expression): boolean {
    return (
      expr instanceof LoopExpr ||
      expr instanceof IfExpr ||
      expr instanceof SwitchExpr ||
      expr instanceof AsmBlockExpr ||
      expr instanceof BlockExpr ||
      expr instanceof FunctionDeclarationExpr
    );
  }
}
