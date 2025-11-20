import Token from "./token";
import TokenType from "./tokenType";

class Lexer {
  constructor(input: string) {
    this.input = input;
    this.index = 0;
  }

  index: number = 0;
  line: number = 1;
  input: string;
  tokens = [] as Token[];

  public static readonly PARENTHESIS_REGEX = /^[\(\)\[\]\{\}]$/;
  public static readonly PUNCTUATION_REGEX = /^[\.:;,_?]$/;
  public static readonly OPERATOR_REGEX = /^[+\-*/%^~]$/;
  public static readonly EQUALITY_OPERATOR_REGEX = /^[=!<>]$/;
  public static readonly LOGICAL_OPERATOR_REGEX = /^[&|]$/;
  public static readonly NUMBER_LITERAL_REGEX = /^[0-9]$/;
  public static readonly NUMBER_LITERAL_ALL_BASES_REGEX = /^[0-9xboA-Fa-f]$/;
  public static readonly IDENTIFIER_REGEX = /^[a-zA-Z_]$/;
  public static readonly IDENTIFIER_CONTINUATION_REGEX = /^[a-zA-Z0-9_]$/;

  tokenize() {
    while (!this.isEof()) {
      const token = this.parseToken();
      if (token.type !== TokenType.NOOP) {
        this.tokens.push(token);
      }
    }
    this.tokens.push(new Token(TokenType.EOF, "EOF", ++this.line));
    return this.tokens;
  }

  parseToken(): Token {
    const char = this.consume();
    if (!char) {
      throw new Error("End of input reached");
    }

    if (char === "\n") {
      return new Token(TokenType.NOOP, char, this.line++);
    }
    if (char === " " || char === "\t" || char === "\r") {
      return new Token(TokenType.NOOP, char, this.line);
    }

    if (Lexer.PARENTHESIS_REGEX.test(char)) {
      return this.parseParenthesis(char);
    }

    if (Lexer.PUNCTUATION_REGEX.test(char)) {
      return this.parsePunctuation(char);
    }

    if (Lexer.OPERATOR_REGEX.test(char)) {
      return this.parseOperator(char);
    }

    if (Lexer.EQUALITY_OPERATOR_REGEX.test(char)) {
      return this.parseEqualityOperator(char);
    }

    if (Lexer.LOGICAL_OPERATOR_REGEX.test(char)) {
      return this.parseLogicalOperator(char);
    }

    if (Lexer.NUMBER_LITERAL_REGEX.test(char)) {
      return this.parseNumberLiteral(char);
    }

    if (['"', "'"].includes(char)) {
      return this.parseStringLiteral(char);
    }

    if (char === "#") {
      return this.parseComment();
    }

    if (Lexer.IDENTIFIER_REGEX.test(char)) {
      return this.parseIdentifier(char);
    }

    throw new Error(
      "Detected invalid token: " +
        new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
    );
  }

  parseIdentifier(firstChar: string): Token {
    let identifierStr = firstChar;
    while (
      !this.isEof() &&
      Lexer.IDENTIFIER_CONTINUATION_REGEX.test(this.peek())
    ) {
      identifierStr += this.consume();
    }

    return new Token(TokenType.IDENTIFIER, identifierStr, this.line);
  }

  parseComment(): Token {
    while (!this.isEof()) {
      const char = this.consume();
      if (char === "\n") {
        this.line++;
        break;
      }
    }
    return new Token(TokenType.NOOP, "#", this.line);
  }

  parseStringLiteral(startToken: string): Token {
    let str = "";
    while (!this.isEof()) {
      const char = this.consume();
      if (
        char === "\\" &&
        this.peek() === startToken &&
        (str.length === 0 || str[str.length - 1] !== "\\")
      ) {
        str += this.consume();
      } else if (char === startToken) {
        str = str.replaceAll("\\\\n", "\n");
        str = str.replaceAll("\\\\t", "\t");
        str = str.replaceAll("\\\\r", "\r");
        str = str.replaceAll(`\\${startToken}`, startToken);
        return new Token(TokenType.STRING_LITERAL, str, this.line);
      } else if (char === "\n") {
        throw new Error(
          "Strings cannot span multiple lines" +
            new Token(TokenType.STRING_LITERAL, str, this.line).toString(),
        );
      } else {
        str += char;
      }
    }

    throw new Error(
      "Detected unterminated string literal token: " +
        new Token(TokenType.STRING_LITERAL, str, this.line).toString(),
    );
  }

  parseNumberLiteral(firstChar: string): Token {
    let numberStr = firstChar;

    while (
      !this.isEof() &&
      Lexer.NUMBER_LITERAL_ALL_BASES_REGEX.test(this.peek())
    ) {
      numberStr += this.consume();
    }

    const value: number = Number(numberStr);

    const error_message_key = {
      "0x": "hexadecimal",
      "0b": "binary",
      "0o": "octal",
    };

    if (Number.isNaN(value)) {
      throw new Error(
        `Detected invalid ${error_message_key[numberStr.slice(0, 2) as keyof typeof error_message_key] || ""} number token: ${new Token(TokenType.NUMBER_LITERAL, numberStr, this.line).toString()}`,
      );
    }

    return new Token(TokenType.NUMBER_LITERAL, value.toString(), this.line);
  }

  parseLogicalOperator(char: string): Token {
    switch (char) {
      case "&":
        if (this.peek(0) === "&") {
          this.consume();
          return new Token(TokenType.AND, "&&", this.line);
        }
        return new Token(TokenType.AMPERSAND, "&", this.line);
      case "|":
        if (this.peek(0) === "|") {
          this.consume();
          return new Token(TokenType.OR, "||", this.line);
        }
        return new Token(TokenType.PIPE, "|", this.line);
      default:
        throw new Error(
          "Detected invalid logical operator token: " +
            new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
        );
    }
  }

  parseAssignOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(TokenType.EQUAL, "==", this.line);
    }
    return new Token(TokenType.ASSIGN, "=", this.line);
  }

  parseNotOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(TokenType.NOT_EQUAL, "!=", this.line);
    }
    return new Token(TokenType.NOT, "!", this.line);
  }

  parseLessThanOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(TokenType.LESS_EQUAL, "<=", this.line);
    }
    if (this.peek(0) === "<") {
      this.consume();
      return new Token(TokenType.BITSHIFT_LEFT, "<<", this.line);
    }
    return new Token(TokenType.LESS_THAN, "<", this.line);
  }

  parseGreaterThanOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(TokenType.GREATER_EQUAL, ">=", this.line);
    }
    if (this.peek(0) === ">") {
      this.consume();
      return new Token(TokenType.BITSHIFT_RIGHT, ">>", this.line);
    }
    return new Token(TokenType.GREATER_THAN, ">", this.line);
  }

  parseEqualityOperator(char: string): Token {
    switch (char) {
      case "=":
        return this.parseAssignOperator();
      case "!":
        return this.parseNotOperator();
      case "<":
        return this.parseLessThanOperator();
      case ">":
        return this.parseGreaterThanOperator();
      default:
        throw new Error(
          "Detected invalid equality operator token: " +
            new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
        );
    }
  }

  parseOperator(char: string): Token {
    switch (char) {
      case "+":
        return this.parsePlusOperator();
      case "-":
        return this.parseMinusOperator();
      case "*":
        return this.parseStarOperator();
      case "/":
        return this.parseSlashOperator();
      case "%":
        return this.parsePercentOperator();
      case "^":
        return this.parseCaretOperator();
      case "~":
        return new Token(TokenType.TILDE, "~", this.line);
      default:
        throw new Error(
          "Detected invalid operator token: " +
            new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
        );
    }
  }

  parseCaretOperator(): Token {
    if (this.peek() === "=") {
      this.consume();
      return new Token(TokenType.CARET_ASSIGN, "^=", this.line);
    }
    return new Token(TokenType.CARET, "^", this.line);
  }

  parsePercentOperator(): Token {
    if (this.peek() === "=") {
      this.consume();
      return new Token(TokenType.PERCENT_ASSIGN, "%=", this.line);
    }
    return new Token(TokenType.PERCENT, "%", this.line);
  }

  parseSlashOperator(): Token {
    if (this.peek() === "/") {
      this.consume();
      return new Token(TokenType.SLASH_SLASH, "//", this.line);
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(TokenType.SLASH_ASSIGN, "/=", this.line);
    }
    return new Token(TokenType.SLASH, "/", this.line);
  }

  parseStarOperator(): Token {
    if (this.peek() === "*") {
      this.consume();
      return new Token(TokenType.STAR_STAR, "**", this.line);
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(TokenType.STAR_ASSIGN, "*=", this.line);
    }
    return new Token(TokenType.STAR, "*", this.line);
  }

  parseMinusOperator(): Token {
    if (this.peek() === "-") {
      this.consume();
      return new Token(TokenType.DECREMENT, "--", this.line);
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(TokenType.MINUS_ASSIGN, "-=", this.line);
    }
    return new Token(TokenType.MINUS, "-", this.line);
  }

  parsePlusOperator(): Token {
    if (this.peek() === "+") {
      this.consume();
      return new Token(TokenType.INCREMENT, "++", this.line);
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(TokenType.PLUS_ASSIGN, "+=", this.line);
    }
    return new Token(TokenType.PLUS, "+", this.line);
  }

  parsePunctuation(char: string): Token {
    switch (char) {
      case ",":
        return new Token(TokenType.COMMA, char, this.line);
      case ";":
        return new Token(TokenType.SEMICOLON, char, this.line);
      case ".":
        return new Token(TokenType.DOT, char, this.line);
      case ":":
        return new Token(TokenType.COLON, char, this.line);
      case "_":
        return new Token(TokenType.UNDERSCORE, char, this.line);
      case "?":
        return new Token(TokenType.QUESTION, char, this.line);
      default:
        throw new Error(
          "Detected invalid punctuation token: " +
            new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
        );
    }
  }

  parseParenthesis(char: string): Token {
    switch (char) {
      case "(":
        return new Token(TokenType.OPEN_PAREN, char, this.line);
      case ")":
        return new Token(TokenType.CLOSE_PAREN, char, this.line);
      case "{":
        return new Token(TokenType.OPEN_BRACE, char, this.line);
      case "}":
        return new Token(TokenType.CLOSE_BRACE, char, this.line);
      case "[":
        return new Token(TokenType.OPEN_BRACKET, char, this.line);
      case "]":
        return new Token(TokenType.CLOSE_BRACKET, char, this.line);
      default:
        throw new Error(
          "Detected invalid parenthesis token: " +
            new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
        );
    }
  }

  isEof(): boolean {
    return this.index >= this.input.length;
  }

  peek(offset: number = 0): string {
    return this.isEof() ? "" : (this.input[this.index + offset] ?? "");
  }

  consume(): string {
    const char = this.isEof() ? "" : this.input[this.index++];
    return char!;
  }
}

export default Lexer;
