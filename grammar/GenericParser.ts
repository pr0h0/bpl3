import type { Grammar } from "./types";

export interface TokenNode {
  type: string;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
  file: string;
}

export type TokenEmitter<T> = (
  type: string,
  value: string,
  start: number,
  end: number,
  line: number,
  column: number,
  file: string,
) => T;

export interface GenericParseResult<T> {
  type: "Program";
  tokens: T[];
  startRule: string;
}

export interface ParseResult extends GenericParseResult<TokenNode> {}

const KEYWORDS = new Set([
  "global",
  "local",
  "const",
  "type",
  "frame",
  "static",
  "ret",
  "struct",
  "enum",
  "import",
  "from",
  "export",
  "extern",
  "asm",
  "as",
  "this",
  "loop",
  "if",
  "else",
  "break",
  "continue",
  "try",
  "catch",
  "return",
  "throw",
  "switch",
  "case",
  "default",
  "cast",
  "sizeof",
  "match",
  "Func",
]);
const STRING_LITERAL_PATTERN = /"(?:(?:\\.)|[^"\n\r])*"/y;
const CHAR_LITERAL_PATTERN = /'(?:\\.|[^'\n\r])'/y;
const HEX_NUMBER_LITERAL_PATTERN = /0[xX][0-9a-fA-F]+/y;
const BINARY_NUMBER_LITERAL_PATTERN = /0[bB][01]+/y;
const OCTAL_NUMBER_LITERAL_PATTERN = /0[oO][0-7]+/y;
const DECIMAL_NUMBER_LITERAL_PATTERN =
  /[0-9](?:_?[0-9])*(?:\.[0-9](?:_?[0-9])*)?/y;

function createKeywordStartCodeTable(
  keywords: Set<string>,
): Record<number, true> {
  const table: Record<number, true> = Object.create(null);
  for (const keyword of keywords) {
    table[keyword.charCodeAt(0)] = true;
  }
  return table;
}

const KEYWORD_START_CODES = createKeywordStartCodeTable(KEYWORDS);

function isAsciiDigit(ch: string | undefined): ch is string {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isIdentifierStartCode(code: number): boolean {
  return (
    code === 95 ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isIdentifierPartCode(code: number): boolean {
  return isIdentifierStartCode(code) || (code >= 48 && code <= 57);
}

/**
 * A lightweight, grammar-aware tokenizer that mirrors the rules defined in
 * `grammar/grammar.bpl`. It does not build a full CST/AST, but it provides a
 * structured token stream that higher layers can consume.
 */
export class GenericParser {
  private position = 0;
  private line = 1;
  private column = 1;
  private readonly hasCommentMarker: boolean;

  constructor(
    private readonly grammar: Grammar,
    private readonly source: string,
    private readonly filePath: string = "<memory>",
  ) {
    this.hasCommentMarker = source.includes("#");
  }

  parse(): ParseResult {
    return this.parseWithTokenEmitter(createTokenNode);
  }

  parseWithTokenEmitter<T>(emitToken: TokenEmitter<T>): GenericParseResult<T> {
    const tokens: T[] = [];

    while (this.position < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.position >= this.source.length) break;

      const token =
        this.matchStringLiteral(emitToken) ||
        this.matchCharLiteral(emitToken) ||
        this.matchNumberLiteral(emitToken) ||
        this.matchIdentifierOrKeyword(emitToken) ||
        this.matchPunctuator(emitToken);

      if (!token) {
        const snippet = this.source.slice(this.position, this.position + 25);
        throw new Error(
          `Unrecognized token at ${this.line}:${this.column}: ${snippet}`,
        );
      }

      tokens.push(token);
    }

    return {
      type: "Program",
      tokens,
      startRule: this.grammar.startRule,
    };
  }

  private skipWhitespaceAndComments(): void {
    if (!this.hasCommentMarker) {
      this.skipWhitespaceOnly();
      return;
    }

    let advanced = true;
    while (advanced) {
      advanced = false;

      if (this.skipWhitespaceOnly()) advanced = true;

      // multiline comment /# ... #/
      if (this.source.startsWith("/#", this.position)) {
        const end = this.source.indexOf("#/", this.position + 2);
        if (end === -1) {
          throw new Error(
            `Unterminated multiline comment at ${this.line}:${this.column}`,
          );
        }
        const slice = this.source.slice(this.position, end + 2);
        this.advance(slice);
        advanced = true;
        continue;
      }

      // single-line comment # ...
      if (this.source[this.position] === "#") {
        let end = this.source.indexOf("\n", this.position);
        if (end === -1) end = this.source.length;
        const slice = this.source.slice(this.position, end);
        this.advance(slice);
        advanced = true;
      }
    }
  }

  private skipWhitespaceOnly(): boolean {
    const start = this.position;

    while (this.position < this.source.length) {
      const ch = this.source[this.position]!;
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.position += 1;
        this.column += 1;
        continue;
      }
      if (ch === "\n") {
        this.position += 1;
        this.line += 1;
        this.column = 1;
        continue;
      }
      break;
    }

    return this.position !== start;
  }

  private matchStringLiteral<T>(emitToken: TokenEmitter<T>): T | null {
    const firstChar = this.source[this.position];

    // Standard string literal
    if (firstChar === "\"") {
      const match = this.execAt(STRING_LITERAL_PATTERN, this.position);
      if (match) {
        return this.createToken("StringLiteral", match[0]!, emitToken);
      }
      return null;
    }

    // Interpolated string literal
    // Matches `...` with support for nested interpolation ${...}
    if (firstChar === "`") {
      const end = this.scanInterpolatedString(this.position);
      if (end !== -1) {
        const value = this.source.slice(this.position, end);
        return this.createToken(
          "InterpolatedStringLiteral",
          value,
          emitToken,
        );
      }
    }

    return null;
  }

  private scanInterpolatedString(startIndex: number): number {
    let index = startIndex + 1; // Skip `
    let depth = 0; // Brace depth inside ${...}

    while (index < this.source.length) {
      const ch = this.source[index];

      if (depth === 0) {
        if (ch === "`") {
          return index + 1;
        } else if (ch === "\\") {
          index += 2;
        } else if (ch === "$" && this.source[index + 1] === "{") {
          depth++;
          index += 2;
        } else {
          index++;
        }
      } else {
        // Inside ${ ... }
        if (ch === "}") {
          depth--;
          index++;
        } else if (ch === "{") {
          depth++;
          index++;
        } else if (ch === '"') {
          // String literal "..."
          index++;
          while (index < this.source.length) {
            if (this.source[index] === '"') {
              index++;
              break;
            } else if (this.source[index] === "\\") {
              index += 2;
            } else {
              index++;
            }
          }
        } else if (ch === "`") {
          // Nested interpolated string `...`
          const end = this.scanInterpolatedString(index);
          if (end === -1) return -1;
          index = end;
        } else if (ch === "\\") {
          index += 2;
        } else {
          index++;
        }
      }
    }
    return -1;
  }

  private matchCharLiteral<T>(emitToken: TokenEmitter<T>): T | null {
    const firstChar = this.source[this.position];
    if (firstChar !== "'") return null;

    const match = this.execAt(CHAR_LITERAL_PATTERN, this.position);
    if (!match) return null;
    return this.createToken("CharLiteral", match[0]!, emitToken);
  }

  private matchNumberLiteral<T>(emitToken: TokenEmitter<T>): T | null {
    const firstChar = this.source[this.position];
    if (!isAsciiDigit(firstChar)) return null;

    const secondChar = this.source[this.position + 1];
    let pattern = DECIMAL_NUMBER_LITERAL_PATTERN;

    if (firstChar === "0") {
      if (secondChar === "x" || secondChar === "X") {
        pattern = HEX_NUMBER_LITERAL_PATTERN;
      } else if (secondChar === "b" || secondChar === "B") {
        pattern = BINARY_NUMBER_LITERAL_PATTERN;
      } else if (secondChar === "o" || secondChar === "O") {
        pattern = OCTAL_NUMBER_LITERAL_PATTERN;
      }
    }

    const match = this.execAt(pattern, this.position);
    if (match) return this.createToken("NumberLiteral", match[0]!, emitToken);

    if (pattern !== DECIMAL_NUMBER_LITERAL_PATTERN) {
      const decimalFallback = this.execAt(
        DECIMAL_NUMBER_LITERAL_PATTERN,
        this.position,
      );
      if (decimalFallback) {
        return this.createToken(
          "NumberLiteral",
          decimalFallback[0]!,
          emitToken,
        );
      }
    }

    return null;
  }

  private matchIdentifierOrKeyword<T>(emitToken: TokenEmitter<T>): T | null {
    const start = this.position;
    const firstCode = this.source.charCodeAt(start);
    if (!isIdentifierStartCode(firstCode)) return null;

    const end = this.scanIdentifierEnd(start + 1);
    const value = this.source.slice(start, end);
    if (
      (firstCode === 116 && value === "true") ||
      (firstCode === 102 && value === "false")
    ) {
      return this.createTokenFromRange(
        "BoolLiteral",
        value,
        start,
        end,
        emitToken,
      );
    }
    if (
      firstCode === 110 &&
      (value === "null" || value === "nullptr")
    ) {
      return this.createTokenFromRange(
        "NullptrLiteral",
        value,
        start,
        end,
        emitToken,
      );
    }

    if (KEYWORD_START_CODES[firstCode] === true && KEYWORDS.has(value)) {
      return this.createTokenFromRange(
        "Keyword",
        value,
        start,
        end,
        emitToken,
      );
    }
    return this.createTokenFromRange(
      "Identifier",
      value,
      start,
      end,
      emitToken,
    );
  }

  private scanIdentifierEnd(index: number): number {
    while (
      index < this.source.length &&
      isIdentifierPartCode(this.source.charCodeAt(index))
    ) {
      index += 1;
    }
    return index;
  }

  private matchPunctuator<T>(emitToken: TokenEmitter<T>): T | null {
    const firstCode = this.source.charCodeAt(this.position);
    const secondCode = this.source.charCodeAt(this.position + 1);

    switch (firstCode) {
      case 33:
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "!=" : "!",
          emitToken,
        );
      case 36:
        return this.createToken("Punctuator", "$", emitToken);
      case 37:
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "%=" : "%",
          emitToken,
        );
      case 38:
        if (secondCode === 38) {
          return this.createToken("Punctuator", "&&", emitToken);
        }
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "&=" : "&",
          emitToken,
        );
      case 40:
        return this.createToken("Punctuator", "(", emitToken);
      case 41:
        return this.createToken("Punctuator", ")", emitToken);
      case 42:
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "*=" : "*",
          emitToken,
        );
      case 43:
        if (secondCode === 43) {
          return this.createToken("Punctuator", "++", emitToken);
        }
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "+=" : "+",
          emitToken,
        );
      case 44:
        return this.createToken("Punctuator", ",", emitToken);
      case 45:
        if (secondCode === 45) {
          return this.createToken("Punctuator", "--", emitToken);
        }
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "-=" : "-",
          emitToken,
        );
      case 46:
        if (
          secondCode === 46 &&
          this.source.charCodeAt(this.position + 2) === 46
        ) {
          return this.createToken("Punctuator", "...", emitToken);
        }
        return this.createToken("Punctuator", ".", emitToken);
      case 47:
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "/=" : "/",
          emitToken,
        );
      case 58:
        return this.createToken("Punctuator", ":", emitToken);
      case 59:
        return this.createToken("Punctuator", ";", emitToken);
      case 60:
        if (secondCode === 61) {
          return this.createToken("Punctuator", "<=", emitToken);
        }
        return this.createToken(
          "Punctuator",
          secondCode === 60 ? "<<" : "<",
          emitToken,
        );
      case 61:
        if (secondCode === 61) {
          return this.createToken("Punctuator", "==", emitToken);
        }
        return this.createToken(
          "Punctuator",
          secondCode === 62 ? "=>" : "=",
          emitToken,
        );
      case 62:
        if (secondCode === 61) {
          return this.createToken("Punctuator", ">=", emitToken);
        }
        return this.createToken(
          "Punctuator",
          secondCode === 62 ? ">>" : ">",
          emitToken,
        );
      case 63:
        return this.createToken("Punctuator", "?", emitToken);
      case 64:
        return this.createToken("Punctuator", "@", emitToken);
      case 91:
        return this.createToken("Punctuator", "[", emitToken);
      case 93:
        return this.createToken("Punctuator", "]", emitToken);
      case 94:
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "^=" : "^",
          emitToken,
        );
      case 123:
        return this.createToken("Punctuator", "{", emitToken);
      case 124:
        if (secondCode === 124) {
          return this.createToken("Punctuator", "||", emitToken);
        }
        return this.createToken(
          "Punctuator",
          secondCode === 61 ? "|=" : "|",
          emitToken,
        );
      case 125:
        return this.createToken("Punctuator", "}", emitToken);
      case 126:
        return this.createToken("Punctuator", "~", emitToken);
      default:
        return null;
    }
  }

  private execAt(regex: RegExp, index: number): RegExpExecArray | null {
    regex.lastIndex = index;
    const match = regex.exec(this.source);
    return match && match.index === index ? match : null;
  }

  private createToken<T>(
    type: string,
    value: string,
    emitToken: TokenEmitter<T>,
  ): T {
    const start = this.position;
    const line = this.line;
    const column = this.column;
    this.advance(value);
    const end = this.position;
    return emitToken(type, value, start, end, line, column, this.filePath);
  }

  private createTokenFromRange<T>(
    type: string,
    value: string,
    start: number,
    end: number,
    emitToken: TokenEmitter<T>,
  ): T {
    const line = this.line;
    const column = this.column;
    this.position = end;
    this.column += end - start;
    return emitToken(type, value, start, end, line, column, this.filePath);
  }

  private advance(text: string): void {
    for (const ch of text) {
      if (ch === "\n") {
        this.line += 1;
        this.column = 1;
      } else {
        this.column += 1;
      }
    }
    this.position += text.length;
  }
}

const createTokenNode: TokenEmitter<TokenNode> = (
  type,
  value,
  start,
  end,
  line,
  column,
  file,
) => ({ type, value, start, end, line, column, file });

export default GenericParser;
