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

export interface ParseResult {
  type: "Program";
  tokens: TokenNode[];
  startRule: string;
}

// Ordered to preserve existing tokenization behavior for overlapping prefixes.
const PUNCTUATORS = [
  "...",
  "==",
  "!=",
  ">=",
  "<=",
  "<<",
  ">>",
  "&&",
  "||",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "?",
  ":",
  "::",
  "=>",
  ",",
  ";",
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  ".",
  "=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "^",
  "!",
  "~",
  "<",
  ">",
  "@",
  "$",
];

function groupPunctuatorsByFirstChar(
  punctuators: string[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const punctuator of punctuators) {
    const firstChar = punctuator[0]!;
    const group = groups.get(firstChar);
    if (group === undefined) {
      groups.set(firstChar, [punctuator]);
    } else {
      group.push(punctuator);
    }
  }
  return groups;
}

const PUNCTUATORS_BY_FIRST_CHAR = groupPunctuatorsByFirstChar(PUNCTUATORS);
const STRING_LITERAL_PATTERN = /"(?:(?:\\.)|[^"\n\r])*"/y;
const CHAR_LITERAL_PATTERN = /'(?:\\.|[^'\n\r])'/y;
const NUMBER_LITERAL_PATTERNS = [
  /0[xX][0-9a-fA-F]+/y,
  /0[bB][01]+/y,
  /0[oO][0-7]+/y,
  /[0-9](?:_?[0-9])*(?:\.[0-9](?:_?[0-9])*)?/y,
];
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/y;

function isAsciiDigit(ch: string | undefined): ch is string {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isIdentifierStart(ch: string | undefined): ch is string {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  return (
    ch === "_" ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
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

  constructor(
    private readonly grammar: Grammar,
    private readonly source: string,
    private readonly filePath: string = "<memory>",
  ) {}

  private readonly keywords = new Set([
    "global",
    "local",
    "const",
    "type",
    "frame",
    "static",
    "ret",
    "struct",
    "import",
    "from",
    "export",
    "extern",
    "asm",
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

  parse(): ParseResult {
    const tokens: TokenNode[] = [];

    while (this.position < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.position >= this.source.length) break;

      const token =
        this.matchStringLiteral() ||
        this.matchCharLiteral() ||
        this.matchNumberLiteral() ||
        this.matchIdentifierOrKeyword() ||
        this.matchPunctuator();

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
    let advanced = true;
    while (advanced) {
      advanced = false;

      // whitespace and newlines
      while (this.position < this.source.length) {
        const ch = this.source[this.position]!;
        if (ch === " " || ch === "\t" || ch === "\r") {
          this.advance(ch);
          advanced = true;
          continue;
        }
        if (ch === "\n") {
          this.advance(ch);
          advanced = true;
          continue;
        }
        break;
      }

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

  private matchStringLiteral(): TokenNode | null {
    const firstChar = this.source[this.position];

    // Standard string literal
    if (firstChar === "\"") {
      const match = this.execAt(STRING_LITERAL_PATTERN, this.position);
      if (match) {
        return this.createToken("StringLiteral", match[0]!);
      }
      return null;
    }

    // Interpolated string literal
    // Matches `...` with support for nested interpolation ${...}
    if (firstChar === "`") {
      const end = this.scanInterpolatedString(this.position);
      if (end !== -1) {
        const value = this.source.slice(this.position, end);
        return this.createToken("InterpolatedStringLiteral", value);
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

  private matchCharLiteral(): TokenNode | null {
    const firstChar = this.source[this.position];
    if (firstChar !== "'") return null;

    const match = this.execAt(CHAR_LITERAL_PATTERN, this.position);
    if (!match) return null;
    return this.createToken("CharLiteral", match[0]!);
  }

  private matchNumberLiteral(): TokenNode | null {
    const firstChar = this.source[this.position];
    if (!isAsciiDigit(firstChar)) return null;

    for (const pattern of NUMBER_LITERAL_PATTERNS) {
      const match = this.execAt(pattern, this.position);
      if (match) {
        return this.createToken("NumberLiteral", match[0]!);
      }
    }
    return null;
  }

  private matchIdentifierOrKeyword(): TokenNode | null {
    const firstChar = this.source[this.position];
    if (!isIdentifierStart(firstChar)) return null;

    const match = this.execAt(IDENTIFIER_PATTERN, this.position);
    if (!match) return null;

    const value = match[0]!;
    if (value === "true" || value === "false")
      return this.createToken("BoolLiteral", value);
    if (value === "null" || value === "nullptr")
      return this.createToken("NullptrLiteral", value);

    if (this.keywords.has(value)) return this.createToken("Keyword", value);
    return this.createToken("Identifier", value);
  }

  private matchPunctuator(): TokenNode | null {
    const firstChar = this.source[this.position];
    if (firstChar === undefined) return null;

    const candidates = PUNCTUATORS_BY_FIRST_CHAR.get(firstChar);
    if (candidates === undefined) return null;

    for (const punct of candidates) {
      if (this.source.startsWith(punct, this.position)) {
        return this.createToken("Punctuator", punct);
      }
    }
    return null;
  }

  private execAt(regex: RegExp, index: number): RegExpExecArray | null {
    regex.lastIndex = index;
    const match = regex.exec(this.source);
    return match && match.index === index ? match : null;
  }

  private createToken(type: string, value: string): TokenNode {
    const start = this.position;
    const line = this.line;
    const column = this.column;
    this.advance(value);
    const end = this.position;
    return { type, value, start, end, line, column, file: this.filePath };
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

export default GenericParser;
