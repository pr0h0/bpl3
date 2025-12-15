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
    "catchOther",
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

  // Ordered longest-first to avoid greedy mis-matches (e.g., '>>' before '>').
  private readonly punctuators = [
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
  ];

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

      // multiline comment ### ... ###
      if (this.source.startsWith("###", this.position)) {
        const end = this.source.indexOf("###", this.position + 3);
        if (end === -1) {
          throw new Error(
            `Unterminated multiline comment at ${this.line}:${this.column}`,
          );
        }
        const slice = this.source.slice(this.position, end + 3);
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
    const regex = /"(?:(?:\\.)|[^"\n\r])*"/y;
    const match = this.execAt(regex, this.position);
    if (!match) return null;
    return this.createToken("StringLiteral", match[0]!);
  }

  private matchCharLiteral(): TokenNode | null {
    const regex = /'(?:\\.|[^'\n\r])'/y;
    const match = this.execAt(regex, this.position);
    if (!match) return null;
    return this.createToken("CharLiteral", match[0]!);
  }

  private matchNumberLiteral(): TokenNode | null {
    const patterns = [
      /0[xX][0-9a-fA-F]+/y,
      /0[bB][01]+/y,
      /0[oO][0-7]+/y,
      /[0-9](?:_?[0-9])*(?:\.[0-9](?:_?[0-9])*)?/y,
    ];

    for (const pattern of patterns) {
      const match = this.execAt(pattern, this.position);
      if (match) {
        return this.createToken("NumberLiteral", match[0]!);
      }
    }
    return null;
  }

  private matchIdentifierOrKeyword(): TokenNode | null {
    const match = this.execAt(/[A-Za-z_][A-Za-z0-9_]*/y, this.position);
    if (!match) return null;

    const value = match[0]!;
    if (value === "true" || value === "false")
      return this.createToken("BoolLiteral", value);
    if (value === "null") return this.createToken("NullLiteral", value);
    if (value === "nullptr") return this.createToken("NullptrLiteral", value);

    if (this.keywords.has(value)) return this.createToken("Keyword", value);
    return this.createToken("Identifier", value);
  }

  private matchPunctuator(): TokenNode | null {
    for (const punct of this.punctuators) {
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
