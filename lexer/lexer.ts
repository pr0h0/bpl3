import Token from "./token";
import TokenType from "./tokenType";
import { CompilerError } from "../errors";

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

  tokenize() {
    while (!this.isEof()) {
      const token = this.parseToken();
      if (token.type !== TokenType.NOOP) {
        this.tokens.push(token);
      }
    }
    this.tokens.push(new Token(TokenType.EOF, "EOF", ++this.line, 1));
    return this.tokens;
  }

  parseToken(): Token {
    this.tokenStartColumn = this.column;
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
      );
    }
    if (char === " " || char === "\t" || char === "\r") {
      return new Token(TokenType.NOOP, char, this.line, this.tokenStartColumn);
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

    throw new CompilerError(
      "Detected invalid token: " + char,
      this.line,
      "Check for typos or unsupported characters.",
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

    return new Token(
      TokenType.IDENTIFIER,
      identifierStr,
      this.line,
      this.tokenStartColumn,
    );
  }

  parseComment(): Token {
    while (!this.isEof()) {
      const char = this.consume();
      if (char === "\n") {
        this.line++;
        break;
      }
    }
    return new Token(TokenType.NOOP, "#", this.line, this.tokenStartColumn);
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

        if (startToken === "'" && str.length === 1) {
          return new Token(
            TokenType.NUMBER_LITERAL,
            str.charCodeAt(0).toString(),
            this.line,
            this.tokenStartColumn,
          );
        }

        return new Token(
          TokenType.STRING_LITERAL,
          str,
          this.line,
          this.tokenStartColumn,
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

  parseNumberLiteral(firstChar: string): Token {
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
      return new Token(
        TokenType.NUMBER_LITERAL,
        "0x" + value.toString(16),
        this.line,
        this.tokenStartColumn,
      );
    } else {
      return new Token(
        TokenType.NUMBER_LITERAL,
        numberStr,
        this.line,
        this.tokenStartColumn,
      );
    }
  }

  parseLogicalOperator(char: string): Token {
    switch (char) {
      case "&":
        if (this.peek(0) === "&") {
          this.consume();
          return new Token(
            TokenType.AND,
            "&&",
            this.line,
            this.tokenStartColumn,
          );
        }
        if (this.peek(0) === "=") {
          this.consume();
          return new Token(
            TokenType.AMPERSAND_ASSIGN,
            "&=",
            this.line,
            this.tokenStartColumn,
          );
        }
        return new Token(
          TokenType.AMPERSAND,
          "&",
          this.line,
          this.tokenStartColumn,
        );
      case "|":
        if (this.peek(0) === "|") {
          this.consume();
          return new Token(
            TokenType.OR,
            "||",
            this.line,
            this.tokenStartColumn,
          );
        }
        if (this.peek(0) === "=") {
          this.consume();
          return new Token(
            TokenType.PIPE_ASSIGN,
            "|=",
            this.line,
            this.tokenStartColumn,
          );
        }
        return new Token(TokenType.PIPE, "|", this.line, this.tokenStartColumn);
      default:
        throw new CompilerError(
          "Detected invalid logical operator: " + char,
          this.line,
        );
    }
  }

  parseAssignOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(TokenType.EQUAL, "==", this.line, this.tokenStartColumn);
    }
    return new Token(TokenType.ASSIGN, "=", this.line, this.tokenStartColumn);
  }

  parseNotOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(
        TokenType.NOT_EQUAL,
        "!=",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(TokenType.NOT, "!", this.line, this.tokenStartColumn);
  }

  parseLessThanOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(
        TokenType.LESS_EQUAL,
        "<=",
        this.line,
        this.tokenStartColumn,
      );
    }
    if (this.peek(0) === "<") {
      this.consume();
      return new Token(
        TokenType.BITSHIFT_LEFT,
        "<<",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(
      TokenType.LESS_THAN,
      "<",
      this.line,
      this.tokenStartColumn,
    );
  }

  parseGreaterThanOperator(): Token {
    if (this.peek(0) === "=") {
      this.consume();
      return new Token(
        TokenType.GREATER_EQUAL,
        ">=",
        this.line,
        this.tokenStartColumn,
      );
    }
    if (this.peek(0) === ">") {
      this.consume();
      return new Token(
        TokenType.BITSHIFT_RIGHT,
        ">>",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(
      TokenType.GREATER_THAN,
      ">",
      this.line,
      this.tokenStartColumn,
    );
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
        throw new CompilerError(
          "Detected invalid equality operator: " + char,
          this.line,
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
        return new Token(
          TokenType.TILDE,
          "~",
          this.line,
          this.tokenStartColumn,
        );
      default:
        throw new CompilerError(
          "Detected invalid operator: " + char,
          this.line,
        );
    }
  }

  parseCaretOperator(): Token {
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.CARET_ASSIGN,
        "^=",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(TokenType.CARET, "^", this.line, this.tokenStartColumn);
  }

  parsePercentOperator(): Token {
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.PERCENT_ASSIGN,
        "%=",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(TokenType.PERCENT, "%", this.line, this.tokenStartColumn);
  }

  parseSlashOperator(): Token {
    // if (this.peek() === "/") {
    //   this.consume();
    //   return new Token(TokenType.SLASH_SLASH, "//", this.line);
    // }
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.SLASH_ASSIGN,
        "/=",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(TokenType.SLASH, "/", this.line, this.tokenStartColumn);
  }

  parseStarOperator(): Token {
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
      );
    }
    return new Token(TokenType.STAR, "*", this.line, this.tokenStartColumn);
  }

  parseMinusOperator(): Token {
    if (this.peek() === "-") {
      this.consume();
      return new Token(
        TokenType.DECREMENT,
        "--",
        this.line,
        this.tokenStartColumn,
      );
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.MINUS_ASSIGN,
        "-=",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(TokenType.MINUS, "-", this.line, this.tokenStartColumn);
  }

  parsePlusOperator(): Token {
    if (this.peek() === "+") {
      this.consume();
      return new Token(
        TokenType.INCREMENT,
        "++",
        this.line,
        this.tokenStartColumn,
      );
    }
    if (this.peek() === "=") {
      this.consume();
      return new Token(
        TokenType.PLUS_ASSIGN,
        "+=",
        this.line,
        this.tokenStartColumn,
      );
    }
    return new Token(TokenType.PLUS, "+", this.line, this.tokenStartColumn);
  }

  parsePunctuation(char: string): Token {
    switch (char) {
      case ",":
        return new Token(
          TokenType.COMMA,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case ";":
        return new Token(
          TokenType.SEMICOLON,
          char,
          this.line,
          this.tokenStartColumn,
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
          );
        }
        return new Token(TokenType.DOT, char, this.line, this.tokenStartColumn);
      case ":":
        return new Token(
          TokenType.COLON,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case "_":
        return new Token(
          TokenType.UNDERSCORE,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case "?":
        return new Token(
          TokenType.QUESTION,
          char,
          this.line,
          this.tokenStartColumn,
        );
      default:
        throw new CompilerError(
          "Detected invalid punctuation: " + char,
          this.line,
        );
    }
  }

  parseParenthesis(char: string): Token {
    switch (char) {
      case "(":
        return new Token(
          TokenType.OPEN_PAREN,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case ")":
        return new Token(
          TokenType.CLOSE_PAREN,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case "{":
        return new Token(
          TokenType.OPEN_BRACE,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case "}":
        return new Token(
          TokenType.CLOSE_BRACE,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case "[":
        return new Token(
          TokenType.OPEN_BRACKET,
          char,
          this.line,
          this.tokenStartColumn,
        );
      case "]":
        return new Token(
          TokenType.CLOSE_BRACKET,
          char,
          this.line,
          this.tokenStartColumn,
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
