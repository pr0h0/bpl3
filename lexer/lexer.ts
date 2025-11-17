import Token from "./token";
import TokenType from "./tokenType";

class Lexer {
  constructor(input: string) {
    this.input = input;
  }

  line: number = 1;
  input: string;
  tokens = [] as Token[];

  tokenize() {
    while (this.input.length) {
      const token = this.parseToken();
      if (token.type !== TokenType.NOOP) {
        this.tokens.push(token);
      }
    }
    this.tokens.push(new Token(TokenType.EOF, "EOF", ++this.line));
    return this.tokens;
  }

  parseToken(): Token {
    const char = this.getChar();
    if (!char) {
      throw new Error("End of input reached");
    }

    if (char === "\n") {
      return new Token(TokenType.NOOP, char, this.line++);
    }
    if (char === " " || char === "\t" || char === "\r") {
      return new Token(TokenType.NOOP, char, this.line);
    }

    if (/^[\(\)\[\]\{\}]$/.test(char)) {
      return this.parseParenthesis(char);
    }

    if (/^[\.:;,_?]$/.test(char)) {
      return this.parsePunctuation(char);
    }

    if (/^[+\-*/%^~]$/.test(char)) {
      return this.parseOperator(char);
    }

    if (/^[=!<>]$/.test(char)) {
      return this.parseEqualityOperator(char);
    }

    if (/^[&|]$/.test(char)) {
      return this.parseLogicalOperator(char);
    }

    if (/^[0-9]$/.test(char)) {
      return this.parseNumberLiteral(char);
    }

    if (['"', "'"].includes(char)) {
      return this.parseStringLiteral(char);
    }

    if (char === "#") {
      return this.parseComment();
    }

    if (/^[a-zA-Z_]$/.test(char)) {
      return this.parseIdentifier(char);
    }

    throw new Error(
      "Detected invalid token: " +
        new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
    );
  }

  parseIdentifier(firstChar: string): Token {
    let identifierStr = firstChar;
    while (this.input.length && /^[a-zA-Z0-9_]$/.test(this.input[0]!)) {
      identifierStr += this.getChar();
    }

    return new Token(TokenType.IDENTIFIER, identifierStr, this.line);
  }

  parseComment(): Token {
    while (this.input.length) {
      const char = this.getChar();
      if (char === "\n") {
        this.line++;
        break;
      }
    }
    return new Token(TokenType.NOOP, "#", this.line);
  }

  parseStringLiteral(startToken: string): Token {
    let str = "";
    while (this.input.length) {
      const char = this.getChar();
      if (
        char === startToken &&
        (str.length > 0 ? str[str.length - 1] !== "\\" : true)
      ) {
        return new Token(TokenType.STRING_LITERAL, str, this.line);
      }
      str += char;
    }

    throw new Error(
      "Detected unterminated string literal token: " +
        new Token(TokenType.STRING_LITERAL, str, this.line).toString(),
    );
  }

  parseNumberLiteral(firstChar: string): Token {
    let numberStr = firstChar;
    while (this.input.length && /^[0-9xboA-Fa-f]$/.test(this.input[0]!)) {
      numberStr += this.getChar();
    }
    let parsed = numberStr;

    if (numberStr.match(/^0(b|o|x)/)) {
      const prefix = numberStr.slice(1, 2);
      if (prefix === "b") {
        const parsedValue = Number(numberStr);
        if (Number.isNaN(parsedValue)) {
          throw new Error(
            "Detected invalid binary number literal token: " +
              new Token(
                TokenType.NUMBER_LITERAL,
                numberStr,
                this.line,
              ).toString(),
          );
        }
        parsed = parsedValue.toString();
      } else if (prefix === "o") {
        const parsedValue = Number(numberStr);
        if (Number.isNaN(parsedValue)) {
          throw new Error(
            "Detected invalid octal number literal token: " +
              new Token(
                TokenType.NUMBER_LITERAL,
                numberStr,
                this.line,
              ).toString(),
          );
        }
        parsed = parsedValue.toString();
      } else if (prefix === "x") {
        const parsedValue = Number(numberStr);
        if (Number.isNaN(parsedValue)) {
          throw new Error(
            "Detected invalid hexadecimal number literal token: " +
              new Token(
                TokenType.NUMBER_LITERAL,
                numberStr,
                this.line,
              ).toString(),
          );
        }
        parsed = parsedValue.toString();
      } else {
        const parsedValue = Number(numberStr);
        if (Number.isNaN(Number(parsed))) {
          throw new Error(
            "Detected invalid number literal token: " +
              new Token(
                TokenType.NUMBER_LITERAL,
                parsed === "NaN" ? numberStr : parsed,
                this.line,
              ).toString(),
          );
        }
        parsed = parsedValue.toString();
      }
    }

    return new Token(TokenType.NUMBER_LITERAL, parsed, this.line);
  }

  parseLogicalOperator(char: string): Token {
    switch (char) {
      case "&":
        return new Token(TokenType.AMPERSAND, "&", this.line);
      case "|":
        return new Token(TokenType.PIPE, "|", this.line);
      default:
        throw new Error(
          "Detected invalid logical operator token: " +
            new Token(TokenType.UNKNOWN, char ?? "", this.line).toString(),
        );
    }
  }

  parseAssignOperator(): Token {
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.EQUAL, "==", this.line);
    }
    return new Token(TokenType.ASSIGN, "=", this.line);
  }

  parseNotOperator(): Token {
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.NOT_EQUAL, "!=", this.line);
    }
    return new Token(TokenType.NOT, "!", this.line);
  }

  parseLessThanOperator(): Token {
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.LESS_EQUAL, "<=", this.line);
    }
    return new Token(TokenType.LESS_THAN, "<", this.line);
  }

  parseGreaterThanOperator(): Token {
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.GREATER_EQUAL, ">=", this.line);
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
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.CARET_ASSIGN, "^=", this.line);
    }
    return new Token(TokenType.CARET, "^", this.line);
  }

  parsePercentOperator(): Token {
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.PERCENT_ASSIGN, "%=", this.line);
    }
    return new Token(TokenType.PERCENT, "%", this.line);
  }

  parseSlashOperator(): Token {
    if (this.input[0] === "/") {
      this.getChar();
      return new Token(TokenType.SLASH_SLASH, "//", this.line);
    }
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.SLASH_ASSIGN, "/=", this.line);
    }
    return new Token(TokenType.SLASH, "/", this.line);
  }

  parseStarOperator(): Token {
    if (this.input[0] === "*") {
      this.getChar();
      return new Token(TokenType.STAR_STAR, "**", this.line);
    }
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.STAR_ASSIGN, "*=", this.line);
    }
    return new Token(TokenType.STAR, "*", this.line);
  }

  parseMinusOperator(): Token {
    if (this.input[0] === "-") {
      this.getChar();
      return new Token(TokenType.DECREMENT, "--", this.line);
    }
    if (this.input[0] === "=") {
      this.getChar();
      return new Token(TokenType.MINUS_ASSIGN, "-=", this.line);
    }
    return new Token(TokenType.MINUS, "-", this.line);
  }

  parsePlusOperator(): Token {
    if (this.input[0] === "+") {
      this.getChar();
      return new Token(TokenType.INCREMENT, "++", this.line);
    }
    if (this.input[0] === "=") {
      this.getChar();
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

  getChar(): string {
    const char = this.input[0]!;
    this.input = this.input.slice(1);
    return char;
  }
}

export default Lexer;
