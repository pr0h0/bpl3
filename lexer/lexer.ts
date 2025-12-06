import { CompilerError } from "../errors";
import Token from "./token";
import TokenType from "./tokenType";

class Lexer {
  constructor(input: string) {
    this.input = input;
    this.index = 0;
  }

  index: number = 0;
  line: number = 1;
  column: number = 1;
  tokenStartColumn: number = 1;
  input: string;
  tokens = [] as Token[];

  public static readonly PARENTHESIS_REGEX = /^[\(\)\[\]\{\}]$/;
  public static readonly PUNCTUATION_REGEX = /^[\.:;,?]$/;
  public static readonly OPERATOR_REGEX = /^[+\-*/%^~]$/;
  public static readonly EQUALITY_OPERATOR_REGEX = /^[=!<>]$/;
  public static readonly LOGICAL_OPERATOR_REGEX = /^[&|]$/;
  public static readonly NUMBER_LITERAL_REGEX = /^[0-9]$/;
  public static readonly NUMBER_LITERAL_ALL_BASES_REGEX = /^[0-9xboA-Fa-f]$/;
  public static readonly IDENTIFIER_REGEX = /^[a-zA-Z_]$/;
  public static readonly IDENTIFIER_CONTINUATION_REGEX = /^[a-zA-Z0-9_]$/;

  tokenize(includeComments: boolean = false) {
    while (!this.isEof()) {
      const token = this.parseToken();
      if (token.type !== TokenType.NOOP) {
        if (token.type === TokenType.COMMENT) {
          if (includeComments) {
            this.tokens.push(token);
          }
        } else {
          this.tokens.push(token);
        }
      }
    }
    this.tokens.push(new Token(TokenType.EOF, "EOF", ++this.line, 1));
    return this.tokens;
  }

  parseToken(): Token {
    this.tokenStartColumn = this.column;
    const start = this.index;
    const char = this.consume();
    if (!char) {
      throw new CompilerError("End of input reached", this.line);
    }

    if (char === "\n") {
      return new Token(
        TokenType.NOOP,
        char,
        this.line++,
        this.tokenStartColumn,
        start,
        char,
      );
    }
    if (char === " " || char === "\t" || char === "\r") {
      return new Token(
        TokenType.NOOP,
        char,
        this.line,
        this.tokenStartColumn,
        start,
        char,
      );
    }

    if (Lexer.PARENTHESIS_REGEX.test(char)) {
      return this.parseParenthesis(char, start);
    }

    if (Lexer.PUNCTUATION_REGEX.test(char)) {
      return this.parsePunctuation(char, start);
    }

    if (Lexer.OPERATOR_REGEX.test(char)) {
      return this.parseOperator(char, start);
    }

    if (Lexer.EQUALITY_OPERATOR_REGEX.test(char)) {
      return this.parseEqualityOperator(char, start);
    }

    if (Lexer.LOGICAL_OPERATOR_REGEX.test(char)) {
      return this.parseLogicalOperator(char, start);
    }

    if (Lexer.NUMBER_LITERAL_REGEX.test(char)) {
      return this.parseNumberLiteral(char, start);
    }

    if (['"', "'"].includes(char)) {
      return this.parseStringLiteral(char, start);
    }

    if (char === "#") {
      return this.parseComment(start);
    }

    if (Lexer.IDENTIFIER_REGEX.test(char)) {
      const token = this.parseIdentifier(char, start);
      if (token.value === "sizeof") {
        token.type = TokenType.SIZEOF;
      }
      return token;
    }

    throw new CompilerError(
      "Detected invalid token: " + char,
      this.line,
      "Check for typos or unsupported characters.",
    );
  }

  parseIdentifier(firstChar: string, start: number): Token {
    let identifierStr = firstChar;
    while (
      !this.isEof() &&
      Lexer.IDENTIFIER_CONTINUATION_REGEX.test(this.peek())
    ) {
      identifierStr += this.consume();
    }

    return new Token(
      TokenType.IDENTIFIER,
      identifierStr,
      this.line,
      this.tokenStartColumn,
      start,
      identifierStr,
    );
  }

  parseComment(start: number): Token {
    const startLine = this.line;
    let comment = "#";
    while (!this.isEof()) {
      const char = this.consume();
      if (char === "\n") {
        this.line++;
        break;
      }
      comment += char;
    }
    return new Token(
      TokenType.COMMENT,
      comment,
      startLine,
      this.tokenStartColumn,
      start,
      comment,
    );
  }

  parseStringLiteral(startToken: string, start: number): Token {
    let str = "";
    let raw = startToken;
    while (!this.isEof()) {
      const char = this.consume();
      raw += char;
      if (
        char === "\\" &&
        this.peek() === startToken &&
        (str.length === 0 || str[str.length - 1] !== "\\")
      ) {
        str += this.consume();
        raw += this.input[this.index - 1];
      } else if (char === startToken) {
        str = str.replaceAll("\\\\n", "\n");
        str = str.replaceAll("\\\\t", "\t");
        str = str.replaceAll("\\\\r", "\r");
        str = str.replaceAll(`\\${startToken}`, startToken);

        if (startToken === "'" && str.length === 1) {
          return new Token(
            TokenType.NUMBER_LITERAL,
            str.charCodeAt(0).toString(),
            this.line,
            this.tokenStartColumn,
            start,
            raw,
          );
        }

        return new Token(
          TokenType.STRING_LITERAL,
          str,
          this.line,
          this.tokenStartColumn,
          start,
          raw,
        );
      } else if (char === "\n") {
        throw new CompilerError(
          "Strings cannot span multiple lines",
          this.line,
          "Use \\n for newlines.",
        );
      } else {
        str += char;
      }
    }

    throw new CompilerError(
      "Detected unterminated string literal",
      this.line,
      "Did you forget a closing quote?",
    );
  }

  parseNumberLiteral(firstChar: string, start: number): Token {
    let numberStr = firstChar;
    let hasDot = false;

    while (!this.isEof()) {
      const char = this.peek();
      if (Lexer.NUMBER_LITERAL_ALL_BASES_REGEX.test(char)) {
        numberStr += this.consume();
      } else if (char === "." && !hasDot) {
        // Only allow dot if it's a decimal number (not hex/bin/oct)
        // and followed by a digit to avoid capturing method calls like 1.toString()
        const isBase =
          numberStr.startsWith("0x") ||
          numberStr.startsWith("0b") ||
          numberStr.startsWith("0o");
        if (!isBase && Lexer.NUMBER_LITERAL_REGEX.test(this.peek(1))) {
          hasDot = true;
          numberStr += this.consume();
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const value: number = Number(numberStr);

    const error_message_key = {
      "0x": "hexadecimal",
      "0b": "binary",
      "0o": "octal",
    };

    if (Number.isNaN(value)) {
      throw new CompilerError(
        `Detected invalid ${error_message_key[numberStr.slice(0, 2) as keyof typeof error_message_key] || ""} number token: ${numberStr}`,
        this.line,
        "Check number format.",
      );
    }

    // return all bases as hex, except decimal
    if (Object.keys(error_message_key).includes(numberStr.slice(0, 2))) {
      // Use BigInt for hex/bin/oct to preserve precision for 64-bit integers
      try {
        const bigVal = BigInt(numberStr);
        return new Token(
          TokenType.NUMBER_LITERAL,
          "0x" + bigVal.toString(16),
          this.line,
          this.tokenStartColumn,
          start,
          numberStr,
        );
      } catch (e) {
        // Fallback to Number if BigInt fails (e.g. floats shouldn't be here anyway for these bases)
      }
      return new Token(
        TokenType.NUMBER_LITERAL,
        "0x" + value.toString(16),
        this.line,
        this.tokenStartColumn,
        start,
        numberStr,
      );
    } else {
      return new Token(
        TokenType.NUMBER_LITERAL,
        numberStr,
        this.line,
        this.tokenStartColumn,
        start,
        numberStr,
      );
    }
  }

  parseLogicalOperator(char: string, start: number): Token {
    switch (char) {
      case "&":
        if (this.peek(0) === "&") {
          this.consume();
          return new Token(
            TokenType.AND,
            "&&",
            this.line,
            this.tokenStartColumn,
            start,
            "&&",
          );
        }
        if (this.peek(0) === "=") {
          this.consume();
          return new Token(
            TokenType.AMPERSAND_ASSIGN,
            "&=",
            this.line,
            this.tokenStartColumn,
            start,
            "&=",
          );
        }
        return new Token(
          TokenType.AMPERSAND,
          "&",
          this.line,
          this.tokenStartColumn,
          start,
          "&",
        );
      case "|":
        if (this.peek(0) === "|") {
          this.consume();
          return new Token(
            TokenType.OR,
            "||",
            this.line,
            this.tokenStartColumn,
            start,
            "||",
          );
        }
        if (this.peek(0) === "=") {
          this.consume();
          return new Token(
            TokenType.PIPE_ASSIGN,
            "|=",
            this.line,
            this.tokenStartColumn,
            start,
            "|=",
          );
        }
        return new Token(
          TokenType.PIPE,
          "|",
          this.line,
          this.tokenStartColumn,
          start,
          "|",
        );
      default:
        throw new CompilerError(
          "Detected invalid logical operator: " + char,
          this.line,
        );
    }
  }

  parseAssignOperator(start: number): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(
        TokenType.EQUAL,
        "==",
        this.line,
        this.tokenStartColumn,
        start,
        "==",
      );
    }
    return new Token(
      TokenType.ASSIGN,
      "=",
      this.line,
      this.tokenStartColumn,
      start,
      "=",
    );
  }

  parseNotOperator(start: number): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(
        TokenType.NOT_EQUAL,
        "!=",
        this.line,
        this.tokenStartColumn,
        start,
        "!=",
      );
    }
    return new Token(
      TokenType.NOT,
      "!",
      this.line,
      this.tokenStartColumn,
      start,
      "!",
    );
  }

  parseLessThanOperator(start: number): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(
        TokenType.LESS_EQUAL,
        "<=",
        this.line,
        this.tokenStartColumn,
        start,
        "<=",
      );
    }
    if (this.peek(0) === "<") {
      this.consume();
      return new Token(
        TokenType.BITSHIFT_LEFT,
        "<<",
        this.line,
        this.tokenStartColumn,
        start,
        "<<",
      );
    }
    return new Token(
      TokenType.LESS_THAN,
      "<",
      this.line,
      this.tokenStartColumn,
      start,
      "<",
    );
  }

  parseGreaterThanOperator(start: number): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(
        TokenType.GREATER_EQUAL,
        ">=",
        this.line,
        this.tokenStartColumn,
        start,
        ">=",
      );
    }
    if (this.peek(0) === ">") {
      this.consume();
      return new Token(
        TokenType.BITSHIFT_RIGHT,
        ">>",
        this.line,
        this.tokenStartColumn,
        start,
        ">>",
      );
    }
    return new Token(
      TokenType.GREATER_THAN,
      ">",
      this.line,
      this.tokenStartColumn,
      start,
      ">",
    );
  }

  parseEqualityOperator(char: string, start: number): Token {
    switch (char) {
      case "=":
        return this.parseAssignOperator(start);
      case "!":
        return this.parseNotOperator(start);
      case "<":
        return this.parseLessThanOperator(start);
      case ">":
        return this.parseGreaterThanOperator(start);
      default:
        throw new CompilerError(
          "Detected invalid equality operator: " + char,
          this.line,
        );
    }
  }

  parseOperator(char: string, start: number): Token {
    switch (char) {
      case "+":
        return this.parsePlusOperator(start);
      case "-":
        return this.parseMinusOperator(start);
      case "*":
        return this.parseStarOperator(start);
      case "/":
        return this.parseSlashOperator(start);
      case "%":
        return this.parsePercentOperator(start);
      case "^":
        return this.parseCaretOperator(start);
      case "~":
        return new Token(
          TokenType.TILDE,
          "~",
          this.line,
          this.tokenStartColumn,
          start,
          "~",
        );
      default:
        throw new CompilerError(
          "Detected invalid operator: " + char,
          this.line,
        );
    }
  }

  parseCaretOperator(start: number): Token {
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.CARET_ASSIGN,
        "^=",
        this.line,
        this.tokenStartColumn,
        start,
        "^=",
      );
    }
    return new Token(
      TokenType.CARET,
      "^",
      this.line,
      this.tokenStartColumn,
      start,
      "^",
    );
  }

  parsePercentOperator(start: number): Token {
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.PERCENT_ASSIGN,
        "%=",
        this.line,
        this.tokenStartColumn,
        start,
        "%=",
      );
    }
    return new Token(
      TokenType.PERCENT,
      "%",
      this.line,
      this.tokenStartColumn,
      start,
      "%",
    );
  }

  parseSlashOperator(start: number): Token {
    if (this.peek() === "/") {
      this.consume();
      return new Token(
        TokenType.SLASH_SLASH,
        "//",
        this.line,
        this.tokenStartColumn,
        start,
        "//",
      );
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.SLASH_ASSIGN,
        "/=",
        this.line,
        this.tokenStartColumn,
        start,
        "/=",
      );
    }
    return new Token(
      TokenType.SLASH,
      "/",
      this.line,
      this.tokenStartColumn,
      start,
      "/",
    );
  }

  parseStarOperator(start: number): Token {
    // if (this.peek() === "*") {
    //   this.consume();
    //   return new Token(TokenType.STAR_STAR, "**", this.line);
    // }
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.STAR_ASSIGN,
        "*=",
        this.line,
        this.tokenStartColumn,
        start,
        "*=",
      );
    }
    return new Token(
      TokenType.STAR,
      "*",
      this.line,
      this.tokenStartColumn,
      start,
      "*",
    );
  }

  parseMinusOperator(start: number): Token {
    if (this.peek() === "-") {
      this.consume();
      return new Token(
        TokenType.DECREMENT,
        "--",
        this.line,
        this.tokenStartColumn,
        start,
        "--",
      );
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.MINUS_ASSIGN,
        "-=",
        this.line,
        this.tokenStartColumn,
        start,
        "-=",
      );
    }
    return new Token(
      TokenType.MINUS,
      "-",
      this.line,
      this.tokenStartColumn,
      start,
      "-",
    );
  }

  parsePlusOperator(start: number): Token {
    if (this.peek() === "+") {
      this.consume();
      return new Token(
        TokenType.INCREMENT,
        "++",
        this.line,
        this.tokenStartColumn,
        start,
        "++",
      );
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.PLUS_ASSIGN,
        "+=",
        this.line,
        this.tokenStartColumn,
        start,
        "+=",
      );
    }
    return new Token(
      TokenType.PLUS,
      "+",
      this.line,
      this.tokenStartColumn,
      start,
      "+",
    );
  }

  parsePunctuation(char: string, start: number): Token {
    switch (char) {
      case ",":
        return new Token(
          TokenType.COMMA,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case ";":
        return new Token(
          TokenType.SEMICOLON,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case ".":
        if (this.peek(0) === "." && this.peek(1) === ".") {
          this.consume();
          this.consume();
          return new Token(
            TokenType.ELLIPSIS,
            "...",
            this.line,
            this.tokenStartColumn,
            start,
            "...",
          );
        }
        return new Token(
          TokenType.DOT,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case ":":
        return new Token(
          TokenType.COLON,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case "_":
        return new Token(
          TokenType.UNDERSCORE,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case "?":
        return new Token(
          TokenType.QUESTION,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      default:
        throw new CompilerError(
          "Detected invalid punctuation: " + char,
          this.line,
        );
    }
  }

  parseParenthesis(char: string, start: number): Token {
    switch (char) {
      case "(":
        return new Token(
          TokenType.OPEN_PAREN,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case ")":
        return new Token(
          TokenType.CLOSE_PAREN,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case "{":
        return new Token(
          TokenType.OPEN_BRACE,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case "}":
        return new Token(
          TokenType.CLOSE_BRACE,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case "[":
        return new Token(
          TokenType.OPEN_BRACKET,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      case "]":
        return new Token(
          TokenType.CLOSE_BRACKET,
          char,
          this.line,
          this.tokenStartColumn,
          start,
          char,
        );
      default:
        throw new CompilerError(
          "Detected invalid parenthesis: " + char,
          this.line,
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
    if (char === "\n") {
      this.column = 1;
    } else {
      this.column++;
    }
    return char!;
  }
}

export default Lexer;
