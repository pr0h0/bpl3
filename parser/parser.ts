import type Token from "../lexer/token";
import TokenType from "../lexer/tokenType";
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
import FunctionDeclarationExpr from "./expression/functionDeclaration";
import FunctionCallExpr from "./expression/functionCallExpr";
import ReturnExpr from "./expression/returnExpr";
import EOFExpr from "./expression/EOFExpr";
import MemberAccessExpr from "./expression/memberAccessExpr";
import BreakExpr from "./expression/breakExpr";
import ContinueExpr from "./expression/continueExpr";
import ImportExpr from "./expression/importExpr";
import ExportExpr from "./expression/exportExpr";
import ArrayLiteralExpr from "./expression/arrayLiteralExpr";
import ExternDeclarationExpr from "./expression/externDeclarationExpr";
import { CompilerError } from "../errors";

export class Parser {
  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
  }
  private tokens: Token[];
  private current: number;

  public parse(): ProgramExpr {
    const program = new ProgramExpr();

    while (this.current < this.tokens.length) {
      const expr = this.parseExpression();
      program.addExpression(expr);
    }

    return program;
  }

  parseExpression(): Expression {
    const expr = this.parseAssignment();

    if (expr.requiresSemicolon) {
      this.consume(TokenType.SEMICOLON, "Expected ';' after expression.");
    }

    return expr;
  }

  parseAssignment(): Expression {
    const expr = this.parseTernary();
    const nextToken = this.peek();

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
      const operator = this.consume(nextToken!.type);
      const right = this.parseTernary();

      return new BinaryExpr(expr, operator, right);
    }
    return expr;
  }

  parseTernary(): Expression {
    const expr = this.parseLogicalOr();
    const nextToken = this.peek();

    if (nextToken?.type === TokenType.QUESTION) {
      this.consume(TokenType.QUESTION);
      const middle = this.parseTernary();
      this.consume(TokenType.COLON);
      const right = this.parseTernary();

      return new TernaryExpr(expr, middle, right);
    }

    return expr;
  }

  parseLogicalOr(): Expression {
    let expr = this.parseLogicalAnd();
    let nextToken = this.peek();

    while (nextToken?.type === TokenType.OR) {
      this.consume(nextToken.type);
      const right = this.parseLogicalAnd();

      expr = new BinaryExpr(expr, nextToken, right);

      nextToken = this.peek();
    }

    return expr;
  }

  parseLogicalAnd(): Expression {
    let expr = this.parseBitwiseOr();
    let nextToken = this.peek();

    while (nextToken?.type === TokenType.AND) {
      this.consume(nextToken.type);
      const right = this.parseBitwiseOr();

      expr = new BinaryExpr(expr, nextToken, right);

      nextToken = this.peek();
    }
    return expr;
  }

  parseBitwiseOr(): Expression {
    let expr = this.parseBitwiseXor();
    let nextToken = this.peek();

    while (nextToken?.type === TokenType.PIPE) {
      const operator = this.consume(nextToken.type);

      const right = this.parseBitwiseXor();

      expr = new BinaryExpr(expr, operator, right);

      nextToken = this.peek();
    }

    return expr;
  }

  parseBitwiseXor(): Expression {
    let expr = this.parseBitwiseAnd();
    let nextToken = this.peek();

    while (nextToken?.type === TokenType.CARET) {
      const operator = this.consume(nextToken.type);

      const right = this.parseBitwiseAnd();

      expr = new BinaryExpr(expr, operator, right);
      nextToken = this.peek();
    }

    return expr;
  }
  parseBitwiseAnd(): Expression {
    let expr = this.parseEquality();
    let nextToken = this.peek();

    while (nextToken?.type === TokenType.AMPERSAND) {
      const operator = this.consume(nextToken.type);

      const right = this.parseEquality();

      expr = new BinaryExpr(expr, operator, right);

      nextToken = this.peek();
    }

    return expr;
  }

  parseEquality(): Expression {
    let expr = this.parseComparison();
    let nextToken = this.peek();

    while (
      nextToken?.type === TokenType.EQUAL ||
      nextToken?.type === TokenType.NOT_EQUAL
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseComparison();

      expr = new BinaryExpr(expr, operator, right);
      nextToken = this.peek();
    }

    return expr;
  }

  parseComparison(): Expression {
    let expr = this.parseBitwiseShift();
    let nextToken = this.peek();

    while (
      nextToken?.type === TokenType.GREATER_THAN ||
      nextToken?.type === TokenType.LESS_THAN ||
      nextToken?.type === TokenType.GREATER_EQUAL ||
      nextToken?.type === TokenType.LESS_EQUAL
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseBitwiseShift();

      expr = new BinaryExpr(expr, operator, right);
      nextToken = this.peek();
    }

    return expr;
  }

  parseBitwiseShift(): Expression {
    let expr = this.parseAddition();
    let nextToken = this.peek();

    while (
      nextToken?.type === TokenType.BITSHIFT_LEFT ||
      nextToken?.type === TokenType.BITSHIFT_RIGHT
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseAddition();

      expr = new BinaryExpr(expr, operator, right);

      nextToken = this.peek();
    }

    return expr;
  }

  parseAddition(): Expression {
    let expr = this.parseMultiplication();
    let nextToken = this.peek();

    while (
      nextToken?.type === TokenType.PLUS ||
      nextToken?.type === TokenType.MINUS
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseMultiplication();

      expr = new BinaryExpr(expr, operator, right);
      nextToken = this.peek();
    }

    return expr;
  }

  parseMultiplication(): Expression {
    let expr = this.parseUnary();
    let nextToken = this.peek();

    while (
      nextToken?.type === TokenType.STAR ||
      nextToken?.type === TokenType.SLASH ||
      nextToken?.type === TokenType.PERCENT ||
      nextToken?.type === TokenType.SLASH_SLASH
    ) {
      const operator = this.consume(nextToken.type);
      const right = this.parseUnary();

      expr = new BinaryExpr(expr, operator, right);
      nextToken = this.peek();
    }

    return expr;
  }

  parseUnary(): Expression {
    const nextToken = this.peek();
    if (!nextToken)
      throw new CompilerError(
        "Unexpected end of input on unary parse",
        this.tokens[this.current]?.line || 0,
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
      const operator = this.consume(nextToken.type);
      const right = this.parseUnary();
      return new UnaryExpr(operator, right);
    }

    return this.parsePostfix();
  }

  parsePostfix(): Expression {
    let expr = this.parseGrouping();

    while (true) {
      if (this.peek()?.type === TokenType.DOT) {
        this.consume(TokenType.DOT);
        const propertyToken = this.consume(
          TokenType.IDENTIFIER,
          "Expected property name after '.'.",
        );
        const accessExpr = new IdentifierExpr(propertyToken.value);

        expr = new MemberAccessExpr(expr, accessExpr, false);
      } else if (this.peek()?.type === TokenType.OPEN_BRACKET) {
        this.consume(TokenType.OPEN_BRACKET);

        const indexExpr = this.parseTernary();

        this.consume(
          TokenType.CLOSE_BRACKET,
          "Expected ']' after index expression.",
        );

        expr = new MemberAccessExpr(expr, indexExpr, true);
      } else {
        break;
      }
    }

    return expr;
  }

  parseArguments(): Expression[] {
    const args: Expression[] = [];
    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_PAREN) {
      const argExpr = this.parseTernary();
      args.push(argExpr);

      if (
        this.peek()?.type !== TokenType.CLOSE_PAREN &&
        this.peek()?.type !== TokenType.COMMA
      ) {
        throw new CompilerError(
          "Expected ',' or ')' after function argument",
          this.peek()?.line || 0,
        );
      }
      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }
    }
    return args;
  }

  parseGrouping(): Expression {
    const nextToken = this.peek();
    if (!nextToken)
      throw new CompilerError(
        "Unexpected end of input",
        this.peek(-1)?.line || 0,
      );

    if (nextToken.type === TokenType.OPEN_PAREN) {
      this.consume(TokenType.OPEN_PAREN);
      const expr = this.parseTernary();
      this.consume(TokenType.CLOSE_PAREN, "Expected ')' after expression.");

      return expr;
    }

    return this.parsePrimary();
  }

  parsePrimary(): Expression {
    const token = this.peek();
    if (!token)
      throw new CompilerError(
        "Unexpected end of input",
        this.peek(-1)?.line || 0,
      );

    switch (token.type) {
      case TokenType.IDENTIFIER:
        return this.parseIdentifier();
      case TokenType.NUMBER_LITERAL:
        const numberToken = this.consume(TokenType.NUMBER_LITERAL);
        return new NumberLiteralExpr(numberToken.value, numberToken);
      case TokenType.STRING_LITERAL:
        const stringToken = this.consume(TokenType.STRING_LITERAL);
        return new StringLiteralExpr(stringToken.value, stringToken);
      case TokenType.OPEN_BRACKET:
        return this.parseArrayLiteral();
      case TokenType.EOF:
        this.consume(TokenType.EOF);
        return new EOFExpr();
    }

    throw new CompilerError(`Unexpected token: ${token.type}`, token.line);
  }

  parseArrayLiteral(): Expression {
    this.consume(TokenType.OPEN_BRACKET);
    const elements: Expression[] = [];

    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_BRACKET) {
      const element = this.parseTernary();
      elements.push(element);

      if (
        this.peek()?.type !== TokenType.CLOSE_BRACKET &&
        this.peek()?.type !== TokenType.COMMA
      ) {
        throw new CompilerError(
          "Expected ',' or ']' after array element",
          this.peek()?.line || 0,
        );
      }

      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(TokenType.CLOSE_BRACKET, "Expected ']' after array literal.");

    return new ArrayLiteralExpr(elements);
  }

  parseIdentifier(): Expression {
    const token = this.peek()!;
    switch (token.value) {
      case "global":
      case "local":
        return this.parseVariableDeclaration();
      case "frame":
        return this.parseFunctionDeclaration();
      case "loop":
        return this.parseLoopDeclaration();
      case "asm":
        return this.parseAsmBlock();
      case "if":
        return this.parseIfExpression();
      case "struct":
        return this.parseStructDeclaration();
      case "call":
        return this.parseFunctionCall();
      case "return":
        return this.parseFunctionReturn();
      case "break":
        return this.parseBreakExpr();
      case "continue":
        return this.parseContinueExpr();
      case "import":
        return this.parseImportExpression();
      case "export":
        return this.parseExportExpression();
      case "extern":
        return this.parseExternDeclaration();
      case "NULL":
        this.consume(TokenType.IDENTIFIER);
        return new NullLiteral();
      default:
        const identifierToken = this.consume(TokenType.IDENTIFIER);
        return new IdentifierExpr(identifierToken.value);
    }
  }

  parseExternDeclaration(): ExternDeclarationExpr {
    this.consume(TokenType.IDENTIFIER); // consume 'extern'
    const funcNameToken = this.consume(TokenType.IDENTIFIER);
    const args: { type: VariableType; name: string }[] = [];
    this.consume(
      TokenType.OPEN_PAREN,
      "Expected '(' after 'extern' function name.",
    );

    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_PAREN) {
      const argNameToken = this.consume(TokenType.IDENTIFIER);
      this.consume(TokenType.COLON, "Expected ':' after argument name.");

      const argType: VariableType = this.parseType();

      args.push({
        name: argNameToken.value,
        type: argType,
      });

      if (
        this.peek()?.type !== TokenType.CLOSE_PAREN &&
        this.peek()?.type !== TokenType.COMMA
      ) {
        throw new CompilerError(
          "Expected ',' or ')' after function argument",
          this.peek()?.line || 0,
        );
      }

      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(
      TokenType.CLOSE_PAREN,
      "Expected ')' after function arguments.",
    );

    let returnType: VariableType | null = null;
    if (this.peek() && this.peek()!.type !== TokenType.SEMICOLON) {
      const retToken = this.consume(
        TokenType.IDENTIFIER,
        "Expected ret keyword or semicolon after function arguments.",
      );
      if (retToken.value === "ret") {
        returnType = this.parseType();
      } else {
        throw new CompilerError(
          "Expected 'ret' keyword, but got '" + retToken.value + "'",
          retToken.line,
        );
      }
    }

    return new ExternDeclarationExpr(funcNameToken.value, args, returnType);
  }

  parseImportExpression(): Expression {
    this.consume(TokenType.IDENTIFIER);
    const importNames: { name: string; type: "type" | "function" }[] = [];

    while (
      (this.peek()?.type === TokenType.IDENTIFIER ||
        this.peek()?.type === TokenType.OPEN_BRACKET) &&
      this.peek()?.value !== "from"
    ) {
      if (this.peek()?.type === TokenType.OPEN_BRACKET) {
        this.consume(TokenType.OPEN_BRACKET);
        const importNameToken = this.consume(TokenType.IDENTIFIER);
        this.consume(TokenType.CLOSE_BRACKET);
        importNames.push({ name: importNameToken.value, type: "type" });
      } else {
        const importNameToken = this.consume(TokenType.IDENTIFIER);
        importNames.push({ name: importNameToken.value, type: "function" });
      }
      if (this.peek()?.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      } else if (
        this.peek()?.type === TokenType.IDENTIFIER &&
        this.peek()?.value !== "from"
      ) {
        throw new CompilerError(
          "Expected ',' between imports",
          this.peek()?.line || 0,
        );
      }
    }

    if (importNames.length === 0) {
      throw new CompilerError(
        "Expected at least one import name after 'import'",
        this.peek(-1)?.line || 0,
      );
    }

    let moduleNameToken: Token | null = null;
    if (this.peek()?.value === "from") {
      this.consume(TokenType.IDENTIFIER); // consume 'from'
      const nextToken = this.peek(); // check next token for module name, can be identifier or string literal
      if (
        !nextToken ||
        (nextToken?.type !== TokenType.IDENTIFIER &&
          nextToken.type !== TokenType.STRING_LITERAL)
      ) {
        throw new CompilerError(
          "Expected module name after 'from'",
          this.peek(-1)?.line || 0,
        );
      }
      moduleNameToken = this.consume(nextToken!.type);
    }

    return new ImportExpr(moduleNameToken?.value ?? "global", importNames);
  }

  parseExportExpression(): Expression {
    this.consume(TokenType.IDENTIFIER);
    let exportType: "type" | "function" = "function";
    if (this.peek()?.type === TokenType.OPEN_BRACKET) {
      this.consume(TokenType.OPEN_BRACKET);
      exportType = "type";
    }
    const name = this.consume(TokenType.IDENTIFIER);
    if (exportType === "type") {
      this.consume(TokenType.CLOSE_BRACKET, "Expected ']' after export type.");
    }
    return new ExportExpr(name.value, exportType);
  }

  parseFunctionReturn(): Expression {
    this.consume(TokenType.IDENTIFIER);
    let returnExpr: Expression | null = null;
    if (this.peek() && this.peek()!.type !== TokenType.SEMICOLON) {
      returnExpr = this.parseTernary();
    }

    return new ReturnExpr(returnExpr);
  }

  parseFunctionCall(): Expression {
    this.consume(TokenType.IDENTIFIER);
    const funcNameToken = this.consume(TokenType.IDENTIFIER);
    this.consume(
      TokenType.OPEN_PAREN,
      "Expected '(' after 'call' function name.",
    );

    const args = this.parseArguments();

    this.consume(
      TokenType.CLOSE_PAREN,
      "Expected ')' after function call arguments.",
    );

    return new FunctionCallExpr(funcNameToken.value, args);
  }

  parseAsmBlock(): AsmBlockExpr {
    this.consume(TokenType.IDENTIFIER);
    this.consume(TokenType.OPEN_BRACE, "Expected '{' after 'asm'.");

    const asmCodeTokens: Token[] = [];
    while (this.peek()?.type !== TokenType.CLOSE_BRACE) {
      asmCodeTokens.push(this.consume(this.peek()!.type));
    }

    this.consume(TokenType.CLOSE_BRACE, "Expected '}' after asm code block.");

    return new AsmBlockExpr(asmCodeTokens);
  }

  parseStructDeclaration(): StructDeclarationExpr {
    this.consume(TokenType.IDENTIFIER);
    const structNameToken = this.consume(TokenType.IDENTIFIER);
    this.consume(TokenType.OPEN_BRACE, "Expected '{' after struct name.");

    const fields: StructField[] = [];
    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_BRACE) {
      const fieldNameToken = this.consume(TokenType.IDENTIFIER);
      this.consume(TokenType.COLON, "Expected ':' after field name.");

      const fieldTypeToken = this.parseType();

      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }

      fields.push({
        name: fieldNameToken.value,
        type: fieldTypeToken,
      });
    }

    this.consume(TokenType.CLOSE_BRACE, "Expected '}' after struct fields.");

    return new StructDeclarationExpr(structNameToken.value, fields);
  }

  parseBreakExpr(): Expression {
    this.consume(TokenType.IDENTIFIER);
    return new BreakExpr();
  }

  parseContinueExpr(): Expression {
    this.consume(TokenType.IDENTIFIER);
    return new ContinueExpr();
  }

  parseLoopDeclaration(): LoopExpr {
    this.consume(TokenType.IDENTIFIER);
    const body = this.parseCodeBlock();
    return new LoopExpr(body);
  }

  parseFunctionDeclaration(): FunctionDeclarationExpr {
    this.consume(TokenType.IDENTIFIER);
    const funcNameToken = this.consume(TokenType.IDENTIFIER);
    const args: { type: VariableType; name: string }[] = [];
    this.consume(
      TokenType.OPEN_PAREN,
      "Expected '(' after 'frame' function name.",
    );

    while (this.peek() && this.peek()!.type !== TokenType.CLOSE_PAREN) {
      const argNameToken = this.consume(TokenType.IDENTIFIER);
      this.consume(TokenType.COLON, "Expected ':' after argument name.");

      const argType: VariableType = this.parseType();

      args.push({
        name: argNameToken.value,
        type: argType,
      });

      if (
        this.peek()?.type !== TokenType.CLOSE_PAREN &&
        this.peek()?.type !== TokenType.COMMA &&
        this.peek(1)!.type !== TokenType.CLOSE_PAREN
      ) {
        throw new CompilerError(
          "Expected ',' or ')' after function argument",
          this.peek()?.line || 0,
        );
      }

      if (this.peek() && this.peek()!.type === TokenType.COMMA) {
        this.consume(TokenType.COMMA);
      }
    }

    this.consume(
      TokenType.CLOSE_PAREN,
      "Expected ')' after function arguments.",
    );

    let returnType: VariableType | null = null;
    if (this.peek() && this.peek()!.type !== TokenType.OPEN_BRACE) {
      const retToken = this.consume(
        TokenType.IDENTIFIER,
        "Expected ret keyword after function arguments.",
      );
      if (retToken.value !== "ret") {
        throw new CompilerError(
          "Expected 'ret' keyword, but got '" + retToken.value + "'",
          retToken.line,
        );
      }
      returnType = this.parseType();
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
    this.consume(TokenType.IDENTIFIER);
    const condition = this.parseTernary();
    const thenBranch = this.parseCodeBlock();

    let elseBranch: BlockExpr | null = null;
    if (
      this.peek() &&
      this.peek()!.type === TokenType.IDENTIFIER &&
      this.peek()!.value === "else"
    ) {
      this.consume(TokenType.IDENTIFIER);

      if (
        this.peek() &&
        this.peek()!.type === TokenType.IDENTIFIER &&
        this.peek()!.value === "if"
      ) {
        const ifExpr = this.parseIfExpression();
        elseBranch = new BlockExpr([ifExpr]);
      } else {
        elseBranch = this.parseCodeBlock();
      }
    }

    return new IfExpr(condition, thenBranch, elseBranch);
  }

  parseVariableDeclaration(): VariableDeclarationExpr {
    const scopeToken = this.consume(TokenType.IDENTIFIER);
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

    const typeToken = this.parseType();

    if (this.peek() && this.peek()!.type !== TokenType.ASSIGN) {
      if (isConst) {
        throw new CompilerError(
          `Constant variable '${varNameToken.value}' must be initialized.`,
          varNameToken.line,
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
      "Expected '{' at the beginning of a code block.",
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

  parseType(): VariableType {
    const typeInfo: VariableType = {
      name: "",
      isPointer: 0,
      isArray: [],
    };

    while (this.peek()?.type === TokenType.STAR) {
      this.consume(TokenType.STAR);
      typeInfo.isPointer++;
    }

    const typeName = this.consume(TokenType.IDENTIFIER, "Expected type name.");
    typeInfo.name = typeName.value;

    while (this.peek()?.type === TokenType.OPEN_BRACKET) {
      this.consume(TokenType.OPEN_BRACKET);
      let size = 0;
      if (this.peek()?.type === TokenType.NUMBER_LITERAL) {
        const sizeToken = this.consume(TokenType.NUMBER_LITERAL);
        size = Number(sizeToken.value);
      } else if (this.peek()?.type === TokenType.CLOSE_BRACKET) {
        throw new CompilerError(
          "Array size must be specified as a number literal or numeric expression.",
          this.peek()?.line || 0,
        );
      }

      this.consume(
        TokenType.CLOSE_BRACKET,
        "Expected ']' after array brackets.",
      );
      typeInfo.isArray.push(size);
    }

    return typeInfo;
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

    throw new CompilerError(
      errorMessage
        ? errorMessage
        : `Expected token of type ${type}, but got ${token?.type}`,
      token ? token.line : 0,
    );
  }
}
