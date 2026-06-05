import type { Grammar } from "./types";

export const GENERIC_TOKEN_PUNCTUATOR = 1;
export const GENERIC_TOKEN_IDENTIFIER = 2;
export const GENERIC_TOKEN_KEYWORD = 3;
export const GENERIC_TOKEN_NUMBER = 4;
export const GENERIC_TOKEN_STRING = 5;
export const GENERIC_TOKEN_INTERPOLATED_STRING = 6;
export const GENERIC_TOKEN_CHAR = 7;
export const GENERIC_TOKEN_BOOL = 8;
export const GENERIC_TOKEN_NULLPTR = 9;

export type GenericTokenKindCode =
  | typeof GENERIC_TOKEN_PUNCTUATOR
  | typeof GENERIC_TOKEN_IDENTIFIER
  | typeof GENERIC_TOKEN_KEYWORD
  | typeof GENERIC_TOKEN_NUMBER
  | typeof GENERIC_TOKEN_STRING
  | typeof GENERIC_TOKEN_INTERPOLATED_STRING
  | typeof GENERIC_TOKEN_CHAR
  | typeof GENERIC_TOKEN_BOOL
  | typeof GENERIC_TOKEN_NULLPTR;

export interface TokenNode {
  typeCode: GenericTokenKindCode;
  type: string;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
  file: string;
}

export type TokenEmitter<T> = (
  typeCode: GenericTokenKindCode,
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

const STRING_LITERAL_PATTERN = /"(?:(?:\\.)|[^"\n\r])*"/y;
const CHAR_LITERAL_PATTERN = /'(?:\\.|[^'\n\r])'/y;
const HEX_NUMBER_LITERAL_PATTERN = /0[xX][0-9a-fA-F]+/y;
const BINARY_NUMBER_LITERAL_PATTERN = /0[bB][01]+/y;
const OCTAL_NUMBER_LITERAL_PATTERN = /0[oO][0-7]+/y;
const DECIMAL_NUMBER_LITERAL_PATTERN =
  /[0-9](?:_?[0-9])*(?:\.[0-9](?:_?[0-9])*)?/y;

type IdentifierLikeTokenType =
  | "Identifier"
  | "As"
  | "Asm"
  | "Break"
  | "Case"
  | "Cast"
  | "Catch"
  | "Const"
  | "Continue"
  | "Default"
  | "Else"
  | "Enum"
  | "Export"
  | "Extern"
  | "False"
  | "Frame"
  | "From"
  | "Func"
  | "Global"
  | "If"
  | "Import"
  | "Local"
  | "Loop"
  | "Match"
  | "Nullptr"
  | "Ret"
  | "Return"
  | "Self"
  | "Sizeof"
  | "Spec"
  | "Static"
  | "Struct"
  | "Switch"
  | "This"
  | "Throw"
  | "True"
  | "Try"
  | "Type";

interface IdentifierLikeTokenKind {
  typeCode: GenericTokenKindCode;
  type: IdentifierLikeTokenType;
}

const IDENTIFIER_TOKEN_KIND: IdentifierLikeTokenKind = {
  typeCode: GENERIC_TOKEN_IDENTIFIER,
  type: "Identifier",
};
function keywordKind(type: IdentifierLikeTokenType): IdentifierLikeTokenKind {
  return {
    typeCode: GENERIC_TOKEN_KEYWORD,
    type,
  };
}

const AS_TOKEN_KIND = keywordKind("As");
const ASM_TOKEN_KIND = keywordKind("Asm");
const BREAK_TOKEN_KIND = keywordKind("Break");
const CASE_TOKEN_KIND = keywordKind("Case");
const CAST_TOKEN_KIND = keywordKind("Cast");
const CATCH_TOKEN_KIND = keywordKind("Catch");
const CONST_TOKEN_KIND = keywordKind("Const");
const CONTINUE_TOKEN_KIND = keywordKind("Continue");
const DEFAULT_TOKEN_KIND = keywordKind("Default");
const ELSE_TOKEN_KIND = keywordKind("Else");
const ENUM_TOKEN_KIND = keywordKind("Enum");
const EXPORT_TOKEN_KIND = keywordKind("Export");
const EXTERN_TOKEN_KIND = keywordKind("Extern");
const FRAME_TOKEN_KIND = keywordKind("Frame");
const FROM_TOKEN_KIND = keywordKind("From");
const FUNC_TOKEN_KIND = keywordKind("Func");
const GLOBAL_TOKEN_KIND = keywordKind("Global");
const IF_TOKEN_KIND = keywordKind("If");
const IMPORT_TOKEN_KIND = keywordKind("Import");
const LOCAL_TOKEN_KIND = keywordKind("Local");
const LOOP_TOKEN_KIND = keywordKind("Loop");
const MATCH_TOKEN_KIND = keywordKind("Match");
const RET_TOKEN_KIND = keywordKind("Ret");
const RETURN_TOKEN_KIND = keywordKind("Return");
const SELF_TOKEN_KIND = keywordKind("Self");
const SIZEOF_TOKEN_KIND = keywordKind("Sizeof");
const SPEC_TOKEN_KIND = keywordKind("Spec");
const STATIC_TOKEN_KIND = keywordKind("Static");
const STRUCT_TOKEN_KIND = keywordKind("Struct");
const SWITCH_TOKEN_KIND = keywordKind("Switch");
const THIS_TOKEN_KIND = keywordKind("This");
const THROW_TOKEN_KIND = keywordKind("Throw");
const TRY_TOKEN_KIND = keywordKind("Try");
const TYPE_TOKEN_KIND = keywordKind("Type");
const TRUE_TOKEN_KIND: IdentifierLikeTokenKind = {
  typeCode: GENERIC_TOKEN_BOOL,
  type: "True",
};
const FALSE_TOKEN_KIND: IdentifierLikeTokenKind = {
  typeCode: GENERIC_TOKEN_BOOL,
  type: "False",
};
const NULLPTR_TOKEN_KIND: IdentifierLikeTokenKind = {
  typeCode: GENERIC_TOKEN_NULLPTR,
  type: "Nullptr",
};

function classifyIdentifierLike(
  firstCode: number,
  value: string,
): IdentifierLikeTokenKind {
  switch (firstCode) {
    case 83:
      return value.length === 4 && value === "Self"
        ? SELF_TOKEN_KIND
        : IDENTIFIER_TOKEN_KIND;
    case 70:
      return value.length === 4 && value === "Func"
        ? FUNC_TOKEN_KIND
        : IDENTIFIER_TOKEN_KIND;
    case 97:
      switch (value.length) {
        case 2:
          return value === "as" ? AS_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 3:
          return value === "asm" ? ASM_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 98:
      return value.length === 5 && value === "break"
        ? BREAK_TOKEN_KIND
        : IDENTIFIER_TOKEN_KIND;
    case 99:
      switch (value.length) {
        case 4:
          if (value === "case") return CASE_TOKEN_KIND;
          return value === "cast" ? CAST_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 5:
          if (value === "const") return CONST_TOKEN_KIND;
          return value === "catch" ? CATCH_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 8:
          return value === "continue"
            ? CONTINUE_TOKEN_KIND
            : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 100:
      return value.length === 7 && value === "default"
        ? DEFAULT_TOKEN_KIND
        : IDENTIFIER_TOKEN_KIND;
    case 101:
      switch (value.length) {
        case 4:
          if (value === "enum") return ENUM_TOKEN_KIND;
          return value === "else" ? ELSE_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 6:
          if (value === "export") return EXPORT_TOKEN_KIND;
          return value === "extern" ? EXTERN_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 102:
      switch (value.length) {
        case 4:
          return value === "from" ? FROM_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 5:
          if (value === "false") return FALSE_TOKEN_KIND;
          return value === "frame" ? FRAME_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 103:
      return value.length === 6 && value === "global"
        ? GLOBAL_TOKEN_KIND
        : IDENTIFIER_TOKEN_KIND;
    case 105:
      switch (value.length) {
        case 2:
          return value === "if" ? IF_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 6:
          return value === "import"
            ? IMPORT_TOKEN_KIND
            : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 108:
      switch (value.length) {
        case 4:
          return value === "loop" ? LOOP_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 5:
          return value === "local" ? LOCAL_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 109:
      return value.length === 5 && value === "match"
        ? MATCH_TOKEN_KIND
        : IDENTIFIER_TOKEN_KIND;
    case 110:
      switch (value.length) {
        case 4:
          return value === "null" ? NULLPTR_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 7:
          return value === "nullptr"
            ? NULLPTR_TOKEN_KIND
            : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 114:
      switch (value.length) {
        case 3:
          return value === "ret" ? RET_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 6:
          return value === "return"
            ? RETURN_TOKEN_KIND
            : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 115:
      switch (value.length) {
        case 4:
          return value === "spec" ? SPEC_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 6:
          if (value === "struct") return STRUCT_TOKEN_KIND;
          if (value === "static") return STATIC_TOKEN_KIND;
          if (value === "switch") return SWITCH_TOKEN_KIND;
          return value === "sizeof" ? SIZEOF_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    case 116:
      switch (value.length) {
        case 3:
          return value === "try" ? TRY_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 4:
          if (value === "true") return TRUE_TOKEN_KIND;
          if (value === "type") return TYPE_TOKEN_KIND;
          return value === "this" ? THIS_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
        case 5:
          return value === "throw" ? THROW_TOKEN_KIND : IDENTIFIER_TOKEN_KIND;
      }
      return IDENTIFIER_TOKEN_KIND;
    default:
      return IDENTIFIER_TOKEN_KIND;
  }
}

function isAsciiDigit(ch: string | undefined): ch is string {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isIdentifierStartCode(code: number): boolean {
  return (
    code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
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
    hasCommentMarker: boolean = source.includes("#"),
  ) {
    this.hasCommentMarker = hasCommentMarker;
  }

  parse(): ParseResult {
    return this.parseWithTokenEmitter(createTokenNode);
  }

  parseWithTokenEmitter<T>(emitToken: TokenEmitter<T>): GenericParseResult<T> {
    const sourceLength = this.source.length;
    const estimatedTokenCapacity = Math.max(16, sourceLength >>> 1);
    const tokens: T[] = new Array<T>(estimatedTokenCapacity);
    let tokenCount = 0;

    while (this.position < sourceLength) {
      this.skipWhitespaceAndComments();
      if (this.position >= sourceLength) break;

      const token = this.matchNextToken(emitToken);

      if (!token) {
        const snippet = this.source.slice(this.position, this.position + 25);
        throw new Error(
          `Unrecognized token at ${this.line}:${this.column}: ${snippet}`,
        );
      }

      tokens[tokenCount++] = token;
    }

    tokens.length = tokenCount;

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

  private matchNextToken<T>(emitToken: TokenEmitter<T>): T | null {
    const firstCode = this.source.charCodeAt(this.position);

    switch (firstCode) {
      case 34:
        return this.matchStringLiteral(emitToken);
      case 39:
        return this.matchCharLiteral(emitToken);
      default:
        if (firstCode >= 48 && firstCode <= 57) {
          return this.matchNumberLiteral(emitToken);
        }
        if (isIdentifierStartCode(firstCode)) {
          return this.matchIdentifierOrKeyword(emitToken, firstCode);
        }
        return this.matchPunctuator(emitToken, firstCode);
    }
  }

  private matchStringLiteral<T>(emitToken: TokenEmitter<T>): T | null {
    const firstChar = this.source[this.position];

    // Standard string literal
    if (firstChar === '"') {
      const match = this.execAt(STRING_LITERAL_PATTERN, this.position);
      if (match) {
        return this.createToken(
          GENERIC_TOKEN_STRING,
          "StringLiteral",
          match[0]!,
          emitToken,
        );
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
          GENERIC_TOKEN_INTERPOLATED_STRING,
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
    return this.createToken(
      GENERIC_TOKEN_CHAR,
      "CharLiteral",
      match[0]!,
      emitToken,
    );
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
    if (match) {
      return this.createToken(
        GENERIC_TOKEN_NUMBER,
        "NumberLiteral",
        match[0]!,
        emitToken,
      );
    }

    if (pattern !== DECIMAL_NUMBER_LITERAL_PATTERN) {
      const decimalFallback = this.execAt(
        DECIMAL_NUMBER_LITERAL_PATTERN,
        this.position,
      );
      if (decimalFallback) {
        return this.createToken(
          GENERIC_TOKEN_NUMBER,
          "NumberLiteral",
          decimalFallback[0]!,
          emitToken,
        );
      }
    }

    return null;
  }

  private matchIdentifierOrKeyword<T>(
    emitToken: TokenEmitter<T>,
    firstCode: number,
  ): T | null {
    const start = this.position;
    if (!isIdentifierStartCode(firstCode)) return null;

    const end = this.scanIdentifierEnd(start + 1);
    const value = this.source.slice(start, end);
    const tokenKind = classifyIdentifierLike(firstCode, value);
    return this.createTokenFromRange(
      tokenKind.typeCode,
      tokenKind.type,
      value,
      start,
      end,
      emitToken,
    );
  }

  private scanIdentifierEnd(index: number): number {
    const source = this.source;
    const sourceLength = source.length;
    while (
      index < sourceLength &&
      isIdentifierPartCode(source.charCodeAt(index))
    ) {
      index += 1;
    }
    return index;
  }

  private matchPunctuator<T>(
    emitToken: TokenEmitter<T>,
    firstCode: number,
  ): T | null {
    const secondCode = this.source.charCodeAt(this.position + 1);

    switch (firstCode) {
      case 33:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "!=" : "!",
          emitToken,
        );
      case 36:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "$",
          emitToken,
        );
      case 37:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "%=" : "%",
          emitToken,
        );
      case 38:
        if (secondCode === 38) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            "&&",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "&=" : "&",
          emitToken,
        );
      case 40:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "(",
          emitToken,
        );
      case 41:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          ")",
          emitToken,
        );
      case 42:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "*=" : "*",
          emitToken,
        );
      case 43:
        if (secondCode === 43) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            "++",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "+=" : "+",
          emitToken,
        );
      case 44:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          ",",
          emitToken,
        );
      case 45:
        if (secondCode === 45) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            "--",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "-=" : "-",
          emitToken,
        );
      case 46:
        if (
          secondCode === 46 &&
          this.source.charCodeAt(this.position + 2) === 46
        ) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            "...",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          ".",
          emitToken,
        );
      case 47:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "/=" : "/",
          emitToken,
        );
      case 58:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          ":",
          emitToken,
        );
      case 59:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          ";",
          emitToken,
        );
      case 60:
        if (secondCode === 61) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            "<=",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 60 ? "<<" : "<",
          emitToken,
        );
      case 61:
        if (secondCode === 61) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            "==",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 62 ? "=>" : "=",
          emitToken,
        );
      case 62:
        if (secondCode === 61) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            ">=",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 62 ? ">>" : ">",
          emitToken,
        );
      case 63:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "?",
          emitToken,
        );
      case 64:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "@",
          emitToken,
        );
      case 91:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "[",
          emitToken,
        );
      case 93:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "]",
          emitToken,
        );
      case 94:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "^=" : "^",
          emitToken,
        );
      case 123:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "{",
          emitToken,
        );
      case 124:
        if (secondCode === 124) {
          return this.createToken(
            GENERIC_TOKEN_PUNCTUATOR,
            "Punctuator",
            "||",
            emitToken,
          );
        }
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          secondCode === 61 ? "|=" : "|",
          emitToken,
        );
      case 125:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "}",
          emitToken,
        );
      case 126:
        return this.createToken(
          GENERIC_TOKEN_PUNCTUATOR,
          "Punctuator",
          "~",
          emitToken,
        );
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
    typeCode: GenericTokenKindCode,
    type: string,
    value: string,
    emitToken: TokenEmitter<T>,
  ): T {
    const start = this.position;
    const line = this.line;
    const column = this.column;
    if (value.indexOf("\n") === -1) {
      this.position += value.length;
      this.column += value.length;
    } else {
      this.advance(value);
    }
    const end = this.position;
    return emitToken(
      typeCode,
      type,
      value,
      start,
      end,
      line,
      column,
      this.filePath,
    );
  }

  private createTokenFromRange<T>(
    typeCode: GenericTokenKindCode,
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
    return emitToken(
      typeCode,
      type,
      value,
      start,
      end,
      line,
      column,
      this.filePath,
    );
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
  typeCode,
  type,
  value,
  start,
  end,
  line,
  column,
  file,
) => ({ typeCode, type, value, start, end, line, column, file });

export default GenericParser;
