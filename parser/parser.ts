import type Token from "../lexer/token";
import TokenType from "../lexer/tokenType";
import ExpressionType from "./expressionType";
import BinaryExpr from "./expression/binaryExpr";
import Expression from "./expression/expr";
import ProgramExpr from "./expression/programExpr";
import TernaryExpr from "./expression/ternaryExpr";
import UnaryExpr from "./expression/unaryExpr";
import IdentifierExpr from "./expression/identifierExpr";
import NumberLiteralExpr from "./expression/numberLiteralExpr";
import StringLiteralExpr from "./expression/stringLiteralExpr";
import LoopExpr from "./expression/loopExpr";
import { AsmBlockExpr } from "./expression/asmBlockExpr";
import VariableDeclarationExpr, {
  type VariableType,
} from "./expression/variableDeclarationExpr";
import StructDeclarationExpr, {
  type StructField,
} from "./expression/structDeclarationExpr";
import NullLiteral from "./expression/nullLiteralExpr";
import IfExpr from "./expression/ifExpr";
import BlockExpr from "./expression/blockExpr";
import type { FunctionArgument } from "./expression/functionDeclaration";
import FunctionDeclarationExpr from "./expression/functionDeclaration";
import FunctionCallExpr from "./expression/functionCallExpr";
import ReturnExpr from "./expression/returnExpr";
import EOFExpr from "./expression/EOFExpr";
import MemberAccessExpr from "./expression/memberAccessExpr";

export class Parser {
  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
  }
  private tokens: Token[];
  private current: number;

  public parse(): Expression {
    const program = new ProgramExpr();

    while (this.current < this.tokens.length) {
      const expr = this.parseExpression();
      program.addExpression(expr);
    }

    return program;
  }

  parseExpression(): Expression {
    const expr = this.parseAssignment();
    // expr.log();
    if (expr.requiresSemicolon) {
      this.consume(TokenType.SEMICOLON, "Expected ';' after expression.");
    }
    return expr;
  }

  parseAssignment(): Expression {
    const expr = this.parseTernary();
    const nextToken = this.peek();
    if (!nextToken) return expr;

    if (
      nextToken.type === TokenType.ASSIGN ||
      nextToken.type === TokenType.PLUS_ASSIGN ||
      nextToken.type === TokenType.MINUS_ASSIGN ||
      nextToken.type === TokenType.STAR_ASSIGN ||
      nextToken.type === TokenType.SLASH_ASSIGN ||
      nextToken.type === TokenType.PERCENT_ASSIGN ||
      nextToken.type === TokenType.AMPERSAND_ASSIGN ||
      nextToken.type === TokenType.PIPE_ASSIGN ||
      nextToken.type === TokenType.CARET_ASSIGN
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseTernary();

      return new BinaryExpr(expr, operator, right);
    }
    return expr;
  }

  parseTernary(): Expression {
    const expr = this.parseLogicalOr();
    const nextToken = this.peek();
    if (!nextToken) return expr;

    if (nextToken.type === TokenType.QUESTION) {
      this.consume(TokenType.QUESTION);
      let middle: Expression | null;
      if (this.peek()?.type === TokenType.COLON) {
        middle = null;
      } else {
        middle = this.parseTernary();
      }
      this.consume(TokenType.COLON);
      const right = this.parseTernary();

      return new TernaryExpr(expr, middle, right);
    }

    return expr;
  }

  parseLogicalOr(): Expression {
    const expr = this.parseLogicalAnd();
    const nextToken = this.peek();
    const secondNextToken = this.peek(1);
    if (!nextToken || !secondNextToken) return expr;

    if (
      nextToken.type === TokenType.PIPE &&
      secondNextToken.type === TokenType.PIPE
    ) {
      this.consume(TokenType.PIPE);
      this.consume(TokenType.PIPE);
      const right = this.parseLogicalOr();

      const newNextToken = { ...nextToken, value: "||" };
      return new BinaryExpr(expr, newNextToken, right);
    }

    return expr;
  }

  parseLogicalAnd(): Expression {
    const expr = this.parseBitwiseOr();
    const nextToken = this.peek();
    const secondNextToken = this.peek(1);
    if (!nextToken || !secondNextToken) return expr;

    if (
      nextToken.type === TokenType.AMPERSAND &&
      secondNextToken.type === TokenType.AMPERSAND
    ) {
      this.consume(TokenType.AMPERSAND);
      this.consume(TokenType.AMPERSAND);
      const right = this.parseLogicalAnd();

      const newNextToken = { ...nextToken, value: "&&" };
      return new BinaryExpr(expr, newNextToken, right);
    }
    return expr;
  }

  parseBitwiseOr(): Expression {
    const expr = this.parseBitwiseXor();
    const nextToken = this.peek();
    const secondNextToken = this.peek(1);
    if (!nextToken || !secondNextToken) return expr;

    if (
      nextToken.type === TokenType.PIPE &&
      secondNextToken.type !== TokenType.PIPE
    ) {
      const operator = this.consume(nextToken.type);

      const right = this.parseBitwiseOr();

      return new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  parseBitwiseXor(): Expression {
    const expr = this.parseBitwiseAnd();
    const nextToken = this.peek();
    if (!nextToken) return expr;

    if (nextToken.type === TokenType.CARET) {
      const operator = this.consume(nextToken.type);

      const right = this.parseBitwiseXor();

      return new BinaryExpr(expr, operator, right);
    }

    return expr;
  }
  parseBitwiseAnd(): Expression {
    const expr = this.parseEquality();
    const nextToken = this.peek();
    const secondNextToken = this.peek(1);
    if (!nextToken || !secondNextToken) return expr;

    if (
      nextToken.type === TokenType.AMPERSAND &&
      secondNextToken.type !== TokenType.AMPERSAND
    ) {
      const operator = this.consume(nextToken.type);

      const right = this.parseBitwiseAnd();

      return new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  parseEquality(): Expression {
    const expr = this.parseComparison();
    const nextToken = this.peek();
    if (!nextToken) return expr;

    if (
      nextToken.type === TokenType.EQUAL ||
      nextToken.type === TokenType.NOT_EQUAL
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseComparison();

      return new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  parseComparison(): Expression {
    const expr = this.parseBitwiseShift();
    const nextToken = this.peek();
    if (!nextToken) return expr;

    if (
      nextToken.type === TokenType.GREATER_THAN ||
      nextToken.type === TokenType.LESS_THAN ||
      nextToken.type === TokenType.GREATER_EQUAL ||
      nextToken.type === TokenType.LESS_EQUAL
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseBitwiseShift();

      return new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  parseBitwiseShift(): Expression {
    const expr = this.parseAddition();
    const nextToken = this.peek();
    const secondNextToken = this.peek(1);
    if (!nextToken || !secondNextToken) return expr;

    if (
      (nextToken.type === TokenType.LESS_THAN &&
        secondNextToken.type === TokenType.LESS_THAN) ||
      (nextToken.type === TokenType.GREATER_THAN &&
        secondNextToken.type === TokenType.GREATER_THAN)
    ) {
      const operator = this.consume(nextToken.type);
      this.consume(secondNextToken.type);
      const right = this.parseAddition();

      const newOperator = {
        ...operator,
        value: operator.value + operator.value,
      };
      return new BinaryExpr(expr, newOperator, right);
    }

    return expr;
  }

  parseAddition(): Expression {
    const expr = this.parseMultiplication();
    const nextToken = this.peek();
    if (!nextToken) return expr;

    if (
      nextToken.type === TokenType.PLUS ||
      nextToken.type === TokenType.MINUS
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseAddition();

      return new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  parseMultiplication(): Expression {
    const expr = this.parseUnary();
    const nextToken = this.peek();
    if (!nextToken) return expr;

    if (
      nextToken.type === TokenType.STAR ||
      nextToken.type === TokenType.SLASH ||
      nextToken.type === TokenType.PERCENT
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseMultiplication();

      return new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  parseUnary(): Expression {
    const nextToken = this.peek();
    if (!nextToken) throw new Error("Unexpected end of input");

    if (
      nextToken.type === TokenType.MINUS ||
      nextToken.type === TokenType.PLUS ||
      nextToken.type === TokenType.NOT ||
      nextToken.type === TokenType.TILDE ||
      nextToken.type === TokenType.STAR ||
      nextToken.type === TokenType.AMPERSAND
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseUnary();
      return new UnaryExpr(operator, right);
    }

    return this.parseGrouping();
  }

  parseGrouping(): Expression {
    const nextToken = this.peek();
    if (!nextToken) throw new Error("Unexpected end of input");

    if (nextToken.type === TokenType.OPEN_PAREN) {
      this.consume(TokenType.OPEN_PAREN);
      const expr = this.parseTernary();
      this.consume(TokenType.CLOSE_PAREN, "Expected ')' after expression.");

      if (
        this.peek()?.type === TokenType.DOT ||
        this.peek()?.type === TokenType.OPEN_BRACKET
      ) {
        return this.parseIdentifierWithAccess(expr);
      }
      return expr;
    }

    return this.parsePrimary();
  }

  parsePrimary(): Expression {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of input");

    if (token.type === TokenType.IDENTIFIER) {
      if (token.value === "global" || token.value === "local") {
        return this.parseVariableDeclaration();
      }
      if (token.value === "frame") {
        return this.parseFunctionDeclaration();
      }
      if (token.value === "loop") {
        this.consume(TokenType.IDENTIFIER); // consume 'loop' token
        const body = this.parseCodeBlock();
        return new LoopExpr(body);
      }
      if (token.value === "asm") {
        return this.parseAsmBlock();
      }
      if (token.value === "if") {
        return this.parseIfExpression();
      }
      if (token.value === "struct") {
        return this.parseStructDeclaration();
      }

      if (token.value === "NULL") {
        this.consume(TokenType.IDENTIFIER); // consume 'NULL' token
        return new NullLiteral();
      }

      if (token.value === "call") {
        return this.parseFunctionCall();
      }

      if (token.value === "return") {
        return this.parseFunctionReturn();
      }

      if (
        this.peek(1)?.type === TokenType.DOT ||
        this.peek(1)?.type === TokenType.OPEN_BRACKET
      ) {
        return this.parseIdentifierWithAccess();
      }

      const identifierToken = this.consume(TokenType.IDENTIFIER);
      return new IdentifierExpr(identifierToken.value);
    }

    if (token.type === TokenType.NUMBER_LITERAL) {
      const numberToken = this.consume(TokenType.NUMBER_LITERAL);
      return new NumberLiteralExpr(numberToken.value, numberToken);
    }

    if (token.type === TokenType.STRING_LITERAL) {
      const stringToken = this.consume(TokenType.STRING_LITERAL);
      return new StringLiteralExpr(stringToken.value, stringToken);
    }

    if (token.type === TokenType.EOF) {
      this.consume(TokenType.EOF);
      return new EOFExpr();
    }

    console.log(this.tokens.slice(this.current - 3, this.current + 3));
    throw new Error(`Unexpected token: ${token.type} @${token.line}`);
  }

  parseIdentifierWithAccess(prevExpr: Expression | null = null): Expression {
    // start parsing the identifier and its accesses
    // circulary parse until no more accesses are found
    // use MemberAccessExpr for both since both will be base addr + offset
    // for .property and index access [expr]
    // if prevExpr is null that means we are starting fresh,
    // if we have prevExpr, we use it as the base object and continue parsing accesses
    let objectExpr: Expression;
    let accessExpr: Expression;

    if (prevExpr === null) {
      const identifierToken = this.consume(TokenType.IDENTIFIER);
      if (this.peek()?.type === TokenType.DOT) {
        this.consume(TokenType.DOT);
        const propertyToken = this.consume(TokenType.IDENTIFIER);
        accessExpr = new IdentifierExpr(propertyToken.value);
        objectExpr = new IdentifierExpr(identifierToken.value);
        const memberAccess = new MemberAccessExpr(
          objectExpr,
          accessExpr,
          false,
        );
        return this.parseIdentifierWithAccess(memberAccess);
      } else if (this.peek()?.type === TokenType.OPEN_BRACKET) {
        this.consume(TokenType.OPEN_BRACKET);
        const indexExpr = this.parseTernary();
        this.consume(
          TokenType.CLOSE_BRACKET,
          "Expected ']' after index expression.",
        );
        accessExpr = indexExpr;
        objectExpr = new IdentifierExpr(identifierToken.value);
        const memberAccess = new MemberAccessExpr(objectExpr, accessExpr, true);
        return this.parseIdentifierWithAccess(memberAccess);
      }
      throw new Error(
        `Expected '.' or '[' after identifier @${identifierToken.line}`,
      );
    }

    objectExpr = prevExpr;

    if (this.peek()?.type === TokenType.DOT) {
      this.consume(TokenType.DOT);
      const propertyToken = this.consume(TokenType.IDENTIFIER);
      accessExpr = new IdentifierExpr(propertyToken.value);
      const memberAccess = new MemberAccessExpr(objectExpr, accessExpr, false);
      return this.parseIdentifierWithAccess(memberAccess);
    } else if (this.peek()?.type === TokenType.OPEN_BRACKET) {
      this.consume(TokenType.OPEN_BRACKET);
      const indexExpr = this.parseTernary();
      this.consume(
        TokenType.CLOSE_BRACKET,
        "Expected ']' after index expression.",
      );
      accessExpr = indexExpr;
      const memberAccess = new MemberAccessExpr(objectExpr, accessExpr, true);
      return this.parseIdentifierWithAccess(memberAccess);
    }

    return objectExpr;
  }

  parseFunctionReturn(): Expression {
    this.consume(TokenType.IDENTIFIER); // consume 'return' token
    let returnExpr: Expression | null = null;
    if (this.peek() && this.peek()!.type !== TokenType.SEMICOLON) {
      returnExpr = this.parseTernary();
    }

    return new ReturnExpr(returnExpr);
  }

  parseFunctionCall(): Expression {
    this.consume(TokenType.IDENTIFIER); // consume 'call' token
    const funcNameToken = this.consume(TokenType.IDENTIFIER);
    this.consume(
      TokenType.OPEN_PAREN,
      "Expected '(' after 'call' function name.",
    );

    const args: Expression[] = [];
    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_PAREN) {
      const argExpr = this.parseTernary();
      args.push(argExpr);

      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(
      TokenType.CLOSE_PAREN,
      "Expected ')' after function call arguments.",
    );

    return new FunctionCallExpr(funcNameToken.value, args);
  }

  parseAsmBlock(): AsmBlockExpr {
    this.consume(TokenType.IDENTIFIER); // consume 'asm' token
    this.consume(TokenType.OPEN_BRACE, "Expected '{' after 'asm'.");

    const asmCodeTokens: Token[] = [];
    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_BRACE) {
      asmCodeTokens.push(this.consume(this.peek()!.type));
    }

    this.consume(TokenType.CLOSE_BRACE, "Expected '}' after asm code block.");

    return new AsmBlockExpr(asmCodeTokens);
  }

  parseStructDeclaration(): StructDeclarationExpr {
    this.consume(TokenType.IDENTIFIER); // consume 'struct' token
    const structNameToken = this.consume(TokenType.IDENTIFIER);
    this.consume(TokenType.OPEN_BRACE, "Expected '{' after struct name.");

    const fields: StructField[] = [];
    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_BRACE) {
      const fieldNameToken = this.consume(TokenType.IDENTIFIER);
      this.consume(TokenType.COLON, "Expected ':' after field name.");
      let isPointer = 0;
      let isArray = 0;
      while (this.peek() && this.peek()!.type === TokenType.STAR) {
        this.consume(TokenType.STAR);
        isPointer++;
      }
      const fieldTypeToken = this.consume(TokenType.IDENTIFIER);
      while (this.peek() && this.peek()!.type === TokenType.OPEN_BRACKET) {
        this.consume(TokenType.OPEN_BRACKET);
        this.consume(TokenType.CLOSE_BRACKET);
        isArray++;
      }

      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }

      fields.push({
        name: fieldNameToken.value,
        type: fieldTypeToken,
        isPointer,
        isArray,
      });
    }

    this.consume(TokenType.CLOSE_BRACE, "Expected '}' after struct fields.");

    return new StructDeclarationExpr(structNameToken.value, fields);
  }

  parseFunctionDeclaration(): FunctionDeclarationExpr {
    this.consume(TokenType.IDENTIFIER); // consume 'frame' token
    const funcNameToken = this.consume(TokenType.IDENTIFIER);
    const args: FunctionArgument[] = [];
    this.consume(
      TokenType.OPEN_PAREN,
      "Expected '(' after 'frame' function name.",
    );

    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_PAREN) {
      const argNameToken = this.consume(TokenType.IDENTIFIER);
      this.consume(TokenType.COLON, "Expected ':' after argument name.");
      let isPointer = 0;
      let isArray = 0;
      while (this.peek() && this.peek()!.type === TokenType.STAR) {
        this.consume(TokenType.STAR);
        isPointer++;
      }
      const argTypeToken = this.consume(TokenType.IDENTIFIER);
      while (this.peek() && this.peek()!.type === TokenType.OPEN_BRACKET) {
        this.consume(TokenType.OPEN_BRACKET);
        this.consume(TokenType.CLOSE_BRACKET);
        isArray++;
      }

      args.push({
        name: argNameToken.value,
        type: argTypeToken,
        isPointer,
        isArray,
      });

      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(
      TokenType.CLOSE_PAREN,
      "Expected ')' after function arguments.",
    );

    let returnType: FunctionArgument | null = null;
    if (this.peek() && this.peek()!.type !== TokenType.OPEN_BRACE) {
      this.consume(
        TokenType.IDENTIFIER,
        "Expected ret keyword after function arguments.",
      );
      returnType = {
        name: "",
        type: null as any,
        isPointer: 0,
        isArray: 0,
      };
      while (this.peek() && this.peek()!.type === TokenType.STAR) {
        this.consume(TokenType.STAR);
        returnType.isPointer++;
      }
      const returnTypeToken = this.consume(TokenType.IDENTIFIER);
      returnType.type = returnTypeToken;
      while (this.peek() && this.peek()!.type === TokenType.OPEN_BRACKET) {
        this.consume(TokenType.OPEN_BRACKET);
        this.consume(TokenType.CLOSE_BRACKET);
        returnType.isArray++;
      }
    }

    const body = this.parseCodeBlock();

    return new FunctionDeclarationExpr(
      funcNameToken.value,
      args,
      returnType,
      body,
    );
  }

  parseIfExpression(): Expression {
    this.consume(TokenType.IDENTIFIER); // consume 'if' token
    const condition = this.parseTernary();
    const thenBranch = this.parseCodeBlock();

    let elseBranch: BlockExpr | null = null;
    if (
      this.peek() &&
      this.peek()!.type === TokenType.IDENTIFIER &&
      this.peek()!.value === "else"
    ) {
      this.consume(TokenType.IDENTIFIER); // consume 'else' token
      elseBranch = this.parseCodeBlock();
    }

    return new IfExpr(condition, thenBranch, elseBranch);
  }

  parseVariableDeclaration(): VariableDeclarationExpr {
    const scopeToken = this.consume(TokenType.IDENTIFIER); // consume 'global' or 'local' token
    let isConst = false;
    if (
      this.peek() &&
      this.peek()!.type === TokenType.IDENTIFIER &&
      this.peek()!.value === "const"
    ) {
      this.consume(TokenType.IDENTIFIER);
      isConst = true;
    }
    const varNameToken = this.consume(TokenType.IDENTIFIER);
    this.consume(TokenType.COLON, "Expected ':' after variable name.");

    const typeToken: VariableType = {
      name: "",
      isPointer: 0,
      isArray: 0,
    };

    while (this.peek() && this.peek()!.type === TokenType.STAR) {
      this.consume(TokenType.STAR);
      typeToken.isPointer++;
    }

    const typeNameToken = this.consume(TokenType.IDENTIFIER);
    typeToken.name = typeNameToken.value;

    while (this.peek() && this.peek()!.type === TokenType.OPEN_BRACKET) {
      this.consume(TokenType.OPEN_BRACKET);
      this.consume(TokenType.CLOSE_BRACKET);
      typeToken.isArray++;
    }

    if (this.peek() && this.peek()!.type !== TokenType.ASSIGN) {
      if (isConst) {
        throw new Error(
          `Constant variable '${varNameToken.value}' must be initialized. @${varNameToken.line}`,
        );
      }
      return new VariableDeclarationExpr(
        scopeToken.value as "global" | "local",
        isConst,
        varNameToken.value,
        typeToken,
        null,
      );
    }

    this.consume(TokenType.ASSIGN, "Expected '=' after variable type.");
    const initializer = this.parseTernary();
    return new VariableDeclarationExpr(
      scopeToken.value as "global" | "local",
      isConst,
      varNameToken.value,
      typeToken,
      initializer,
    );
  }

  parseCodeBlock(): BlockExpr {
    const expressions: Expression[] = [];
    this.consume(
      TokenType.OPEN_BRACE,
      // "Expected '{' at the beginning of a code block.",
    );

    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_BRACE) {
      const expr = this.parseExpression();
      expressions.push(expr);
    }

    this.consume(
      TokenType.CLOSE_BRACE,
      "Expected '}' at the end of a code block.",
    );
    return new BlockExpr(expressions);
  }

  peek(offset: number = 0): Token | null {
    if (this.current + offset >= this.tokens.length) return null;
    return this.tokens[this.current + offset] ?? null;
  }
  consume(type: TokenType, errorMessage: string = ""): Token {
    const token = this.peek();
    if (token && token.type === type) {
      this.current++;
      return token;
    }

    console.log(this.tokens.slice(this.current - 3, this.current + 3));
    throw new Error(
      errorMessage
        ? errorMessage + `@${token ? token.line : "EOF"}`
        : `Expected token of type ${type}, but got ${token?.type} @${token ? token.line : "EOF"}`,
    );
  }
}
