import { existsSync } from "fs";

import { resolveBplPath, getBplHome } from "../common/PathResolver";
import { CompilerError } from "../common/CompilerError";
import {
  GENERIC_TOKEN_BOOL,
  GENERIC_TOKEN_CHAR,
  GENERIC_TOKEN_IDENTIFIER,
  GENERIC_TOKEN_INTERPOLATED_STRING,
  GENERIC_TOKEN_KEYWORD,
  GENERIC_TOKEN_NULLPTR,
  GENERIC_TOKEN_NUMBER,
  GENERIC_TOKEN_PUNCTUATOR,
  GENERIC_TOKEN_STRING,
  GenericParser,
  type GenericTokenKindCode,
  type TokenNode,
} from "../../grammar/GenericParser";
import { GrammarParser } from "../../grammar/GrammarParser";
import { Token } from "./Token";
import { TokenType } from "./TokenType";

import type { Grammar } from "../../grammar/types";
let cachedGrammar: Grammar | null = null;

function loadGrammar(): Grammar {
  if (cachedGrammar) return cachedGrammar;

  // Use BPL_HOME to locate grammar file
  const grammarPath = resolveBplPath("grammar", "grammar.bpl");

  if (!existsSync(grammarPath)) {
    const bplHome = getBplHome();
    throw new CompilerError(
      `Could not find grammar.bpl file.`,
      `Please ensure BPL_HOME is set correctly or the grammar directory exists.\n` +
        `BPL_HOME: ${bplHome}\n` +
        `Looking for: ${grammarPath}\n` +
        `You can set it with: export BPL_HOME=/path/to/bpl`,
      {
        file: grammarPath,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
    );
  }

  const parser = new GrammarParser(grammarPath);
  cachedGrammar = parser.parse();
  return cachedGrammar;
}

export function lexWithGrammar(source: string, filePath: string): Token[] {
  const grammar = loadGrammar();
  const hasCommentMarker = source.includes("#");
  const genericParser = new GenericParser(
    grammar,
    source,
    filePath,
    hasCommentMarker,
  );

  if (!hasCommentMarker) {
    const { tokens } = genericParser.parseWithTokenEmitter(
      createFrontendTokenFromParts,
    );
    appendEofToken(tokens, filePath);
    return tokens;
  }

  const { tokens } = genericParser.parse();

  const mapped = new Array<Token>(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    mapped[i] = convertTokenNodeToToken(tokens[i]!);
  }

  if (hasCommentMarker) {
    const comments = extractComments(source, filePath, tokens);
    if (comments.length > 0) {
      mapped.push(...comments);
      mapped.sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
      });
    }
  }

  appendEofToken(mapped, filePath);
  return mapped;
}

function appendEofToken(tokens: Token[], filePath: string): void {
  const last = tokens[tokens.length - 1];
  const eofLine = last ? last.line : 1;
  const eofColumn = last ? last.column + last.lexeme.length : 1;

  tokens.push(new Token(TokenType.EOF, "", null, eofLine, eofColumn, filePath));
}

function extractComments(
  source: string,
  filePath: string,
  tokens: TokenNode[],
): Token[] {
  const comments: Token[] = [];
  const lines = source.split("\n");

  // Identify ranges to exclude (strings, chars)
  const excludeRanges = tokens
    .filter(
      (t) =>
        t.type === "StringLiteral" ||
        t.type === "InterpolatedStringLiteral" ||
        t.type === "CharLiteral",
    )
    .map((t) => ({ start: t.start, end: t.end }))
    .sort((a, b) => a.start - b.start);

  // Calculate line start indices
  const lineStartIndices: number[] = [];
  let currentIdx = 0;
  for (const line of lines) {
    lineStartIndices.push(currentIdx);
    currentIdx += line.length + 1; // +1 for newline
  }

  let inBlockComment = false;
  let blockCommentStart = { line: 0, column: 0 };
  let blockCommentContent = "";
  let rangeIdx = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] || "";
    const lineStart = lineStartIndices[lineNum]!;
    let col = 0;

    while (col < line.length) {
      const absPos = lineStart + col;

      // Skip excluded ranges (strings, chars)
      // Advance rangeIdx if current range is past
      while (
        rangeIdx < excludeRanges.length &&
        excludeRanges[rangeIdx]!.end <= absPos
      ) {
        rangeIdx++;
      }

      // Check if inside current range
      if (
        !inBlockComment &&
        rangeIdx < excludeRanges.length &&
        absPos >= excludeRanges[rangeIdx]!.start
      ) {
        // We are inside a string/char literal.
        // Skip until end of range or end of line
        const rangeEnd = excludeRanges[rangeIdx]!.end;
        const dist = rangeEnd - absPos;
        const skip = Math.min(dist, line.length - col);
        col += skip;
        continue;
      }

      // Check for block comment start
      if (!inBlockComment && line.substring(col, col + 2) === "/#") {
        inBlockComment = true;
        blockCommentStart = { line: lineNum + 1, column: col + 1 };
        blockCommentContent = "/#";
        col += 2;
        continue;
      }

      // Check for block comment end
      if (inBlockComment && line.substring(col, col + 2) === "#/") {
        blockCommentContent += "#/";
        comments.push(
          new Token(
            TokenType.Comment,
            blockCommentContent,
            null,
            blockCommentStart.line,
            blockCommentStart.column,
            filePath,
          ),
        );
        inBlockComment = false;
        blockCommentContent = "";
        col += 2;
        continue;
      }

      // Inside block comment
      if (inBlockComment) {
        blockCommentContent += line[col];
        col++;
        continue;
      }

      // Check for single-line comment
      if (line[col] === "#") {
        const commentText = line.substring(col);
        comments.push(
          new Token(
            TokenType.Comment,
            commentText,
            null,
            lineNum + 1,
            col + 1,
            filePath,
          ),
        );
        break; // Rest of line is comment
      }

      col++;
    }

    // Add newline to block comment if we're inside one
    if (inBlockComment && lineNum < lines.length - 1) {
      blockCommentContent += "\n";
    }
  }

  return comments;
}

function convertTokenNodeToToken(node: TokenNode): Token {
  const { typeCode, type, value, start, end, line, column, file } = node;
  return createFrontendTokenFromParts(
    typeCode,
    type,
    value,
    start,
    end,
    line,
    column,
    file,
  );
}

// eslint-disable-next-line max-params -- hot lexer path passes primitives to avoid per-token part objects.
function createFrontendTokenFromParts(
  typeCode: GenericTokenKindCode,
  _type: string,
  value: string,
  _start: number,
  _end: number,
  line: number,
  column: number,
  file: string,
): Token {
  switch (typeCode) {
    case GENERIC_TOKEN_PUNCTUATOR:
      return {
        type: punctuatorTokenType(value),
        lexeme: value,
        literal: null,
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_IDENTIFIER:
      return {
        type: TokenType.Identifier,
        lexeme: value,
        literal: null,
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_INTERPOLATED_STRING:
      return {
        type: TokenType.InterpolatedStringLiteral,
        lexeme: value,
        literal: value,
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_KEYWORD:
      return {
        type: _type as TokenType,
        lexeme: value,
        literal: null,
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_NUMBER:
      return {
        type: TokenType.NumberLiteral,
        lexeme: value,
        literal: parseNumber(value),
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_NULLPTR:
      return {
        type: _type as TokenType,
        lexeme: value,
        literal: null,
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_STRING:
      return {
        type: TokenType.StringLiteral,
        lexeme: value,
        literal: decodeString(value),
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_CHAR:
      return {
        type: TokenType.CharLiteral,
        lexeme: value,
        literal: decodeChar(value),
        line,
        column,
        file,
      } as Token;
    case GENERIC_TOKEN_BOOL:
      const literal = _type === TokenType.True;
      return {
        type: _type as TokenType,
        lexeme: value,
        literal,
        line,
        column,
        file,
      } as Token;
  }

  return {
    type: TokenType.Unknown,
    lexeme: value,
    literal: null,
    line,
    column,
    file,
  } as Token;
}

function punctuatorTokenType(value: string): TokenType {
  switch (value.charCodeAt(0)) {
    case 33:
      if (value.length === 1) return TokenType.Bang;
      return value.charCodeAt(1) === 61
        ? TokenType.BangEqual
        : TokenType.Unknown;
    case 37:
      if (value.length === 1) return TokenType.Percent;
      return value.charCodeAt(1) === 61
        ? TokenType.PercentEqual
        : TokenType.Unknown;
    case 38:
      if (value.length === 1) return TokenType.Ampersand;
      switch (value.charCodeAt(1)) {
        case 38:
          return TokenType.AndAnd;
        case 61:
          return TokenType.AmpersandEqual;
      }
      return TokenType.Unknown;
    case 40:
      return TokenType.LeftParen;
    case 41:
      return TokenType.RightParen;
    case 42:
      if (value.length === 1) return TokenType.Star;
      return value.charCodeAt(1) === 61
        ? TokenType.StarEqual
        : TokenType.Unknown;
    case 43:
      if (value.length === 1) return TokenType.Plus;
      switch (value.charCodeAt(1)) {
        case 43:
          return TokenType.PlusPlus;
        case 61:
          return TokenType.PlusEqual;
      }
      return TokenType.Unknown;
    case 44:
      return TokenType.Comma;
    case 45:
      if (value.length === 1) return TokenType.Minus;
      switch (value.charCodeAt(1)) {
        case 45:
          return TokenType.MinusMinus;
        case 61:
          return TokenType.MinusEqual;
      }
      return TokenType.Unknown;
    case 46:
      if (value.length === 1) return TokenType.Dot;
      return value.length === 3 ? TokenType.Ellipsis : TokenType.Unknown;
    case 47:
      if (value.length === 1) return TokenType.Slash;
      return value.charCodeAt(1) === 61
        ? TokenType.SlashEqual
        : TokenType.Unknown;
    case 58:
      return TokenType.Colon;
    case 59:
      return TokenType.Semicolon;
    case 60:
      if (value.length === 1) return TokenType.Less;
      switch (value.charCodeAt(1)) {
        case 60:
          return TokenType.LessLess;
        case 61:
          return TokenType.LessEqual;
      }
      return TokenType.Unknown;
    case 61:
      if (value.length === 1) return TokenType.Equal;
      return value.charCodeAt(1) === 61
        ? TokenType.EqualEqual
        : TokenType.Unknown;
    case 62:
      if (value.length === 1) return TokenType.Greater;
      switch (value.charCodeAt(1)) {
        case 61:
          return TokenType.GreaterEqual;
        case 62:
          return TokenType.GreaterGreater;
      }
      return TokenType.Unknown;
    case 63:
      return TokenType.Question;
    case 91:
      return TokenType.LeftBracket;
    case 93:
      return TokenType.RightBracket;
    case 94:
      if (value.length === 1) return TokenType.Caret;
      return value.charCodeAt(1) === 61
        ? TokenType.CaretEqual
        : TokenType.Unknown;
    case 123:
      return TokenType.LeftBrace;
    case 124:
      if (value.length === 1) return TokenType.Pipe;
      switch (value.charCodeAt(1)) {
        case 61:
          return TokenType.PipeEqual;
        case 124:
          return TokenType.OrOr;
      }
      return TokenType.Unknown;
    case 125:
      return TokenType.RightBrace;
    case 126:
      return TokenType.Tilde;
  }

  return TokenType.Unknown;
}

function parseNumber(raw: string): number {
  const rawLength = raw.length;
  const firstCode = raw.charCodeAt(0);
  if (rawLength === 1) {
    if (firstCode >= 48 && firstCode <= 57) {
      return firstCode - 48;
    }
  }
  if (rawLength <= 15 && firstCode >= 48 && firstCode <= 57) {
    const plainDecimal = parseSmallPlainDecimalInteger(
      raw,
      rawLength,
      firstCode - 48,
    );
    if (plainDecimal !== null) return plainDecimal;
  }
  if (raw.indexOf("_") === -1) {
    return Number(raw);
  }
  return Number(raw.replace(/_/g, ""));
}

function parseSmallPlainDecimalInteger(
  raw: string,
  rawLength: number,
  firstDigit: number,
): number | null {
  let value = firstDigit;
  for (let index = 1; index < rawLength; index++) {
    const code = raw.charCodeAt(index);
    if (code < 48 || code > 57) return null;
    value = value * 10 + code - 48;
  }
  return value;
}

function decodeString(raw: string): string {
  // raw includes surrounding quotes
  // Remove the quotes first
  const inner = raw.slice(1, -1);

  // Manually process escape sequences
  let result = "";
  let i = 0;

  while (i < inner.length) {
    if (inner[i] === "\\") {
      if (i + 1 >= inner.length) {
        result += "\\";
        i++;
        continue;
      }

      const nextChar = inner[i + 1]!;

      switch (nextChar) {
        case "n":
          result += "\n";
          i += 2;
          break;
        case "t":
          result += "\t";
          i += 2;
          break;
        case "r":
          result += "\r";
          i += 2;
          break;
        case "0":
          result += "\0";
          i += 2;
          break;
        case "\\":
          result += "\\";
          i += 2;
          break;
        case "'":
          result += "'";
          i += 2;
          break;
        case '"':
          result += '"';
          i += 2;
          break;
        case "x": {
          // Hex escape: \xHH
          if (i + 3 < inner.length) {
            const hex = inner.slice(i + 2, i + 4);
            const code = parseInt(hex, 16);
            if (!isNaN(code)) {
              result += String.fromCharCode(code);
              i += 4;
              break;
            }
          }
          // Invalid hex escape, keep as-is
          result += "\\x";
          i += 2;
          break;
        }
        case "u": {
          // Unicode escape: \uHHHH
          if (i + 5 < inner.length) {
            const hex = inner.slice(i + 2, i + 6);
            const code = parseInt(hex, 16);
            if (!isNaN(code)) {
              result += String.fromCharCode(code);
              i += 6;
              break;
            }
          }
          // Invalid unicode escape, keep as-is
          result += "\\u";
          i += 2;
          break;
        }
        default:
          // Unknown escape, keep backslash
          result += "\\" + nextChar;
          i += 2;
          break;
      }
    } else {
      result += inner[i]!;
      i++;
    }
  }

  return result;
}

function decodeChar(raw: string): number {
  const inner = raw.slice(1, -1);
  // Single-quoted char literal -> numeric codepoint (int)
  // Supports common escape sequences
  if (inner.startsWith("\\")) {
    switch (inner[1]) {
      case "n":
        return "\n".charCodeAt(0);
      case "t":
        return "\t".charCodeAt(0);
      case "r":
        return "\r".charCodeAt(0);
      case "\\":
        return "\\".charCodeAt(0);
      case "'":
        return "'".charCodeAt(0);
      case '"':
        return '"'.charCodeAt(0);
      case "0":
        return "\0".charCodeAt(0);
      default:
        // Unknown escape: take following char's codepoint
        return inner[1]?.charCodeAt(0) ?? 0;
    }
  }
  // Regular single character
  return inner.charCodeAt(0) ?? 0;
}
