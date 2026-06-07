import { existsSync } from "fs";

import { resolveBplPath, getBplHome } from "../common/PathResolver";
import { CompilerError } from "../common/CompilerError";
import {
  GENERIC_TOKEN_BOOL,
  GENERIC_TOKEN_CHAR,
  GENERIC_TOKEN_INTERPOLATED_STRING,
  GENERIC_TOKEN_KEYWORD,
  GENERIC_TOKEN_NULLPTR,
  GENERIC_TOKEN_NUMBER,
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
  // GenericParser emits tokens in source order, so literal ranges stay ordered.
  const excludeRanges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    if (
      token.type === "StringLiteral" ||
      token.type === "InterpolatedStringLiteral" ||
      token.type === "CharLiteral"
    ) {
      excludeRanges.push({ start: token.start, end: token.end });
    }
  }

  const sourceLength = source.length;
  let position = 0;
  let line = 1;
  let column = 1;
  let rangeIdx = 0;
  let blockCommentStart = -1;
  let blockCommentLine = 0;
  let blockCommentColumn = 0;

  while (position < sourceLength) {
    while (
      rangeIdx < excludeRanges.length &&
      excludeRanges[rangeIdx]!.end <= position
    ) {
      rangeIdx++;
    }

    if (
      blockCommentStart < 0 &&
      rangeIdx < excludeRanges.length &&
      position >= excludeRanges[rangeIdx]!.start
    ) {
      const rangeEnd = excludeRanges[rangeIdx]!.end;
      while (position < rangeEnd) {
        if (source.charCodeAt(position) === 10) {
          line++;
          column = 1;
        } else {
          column++;
        }
        position++;
      }
      continue;
    }

    const currentCode = source.charCodeAt(position);
    if (blockCommentStart < 0) {
      if (currentCode === 47 && source.charCodeAt(position + 1) === 35) {
        blockCommentStart = position;
        blockCommentLine = line;
        blockCommentColumn = column;
        position += 2;
        column += 2;
        continue;
      }

      if (currentCode === 35) {
        const lineEnd = source.indexOf("\n", position);
        const commentEnd = lineEnd < 0 ? sourceLength : lineEnd;
        comments.push(
          new Token(
            TokenType.Comment,
            source.substring(position, commentEnd),
            null,
            line,
            column,
            filePath,
          ),
        );
        column += commentEnd - position;
        position = commentEnd;
        continue;
      }
    } else if (
      currentCode === 35 &&
      source.charCodeAt(position + 1) === 47
    ) {
      position += 2;
      column += 2;
      comments.push(
        new Token(
          TokenType.Comment,
          source.substring(blockCommentStart, position),
          null,
          blockCommentLine,
          blockCommentColumn,
          filePath,
        ),
      );
      blockCommentStart = -1;
      continue;
    }

    position++;
    if (currentCode === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return comments;
}

function convertTokenNodeToToken(node: TokenNode): Token {
  const { typeCode, type, value, line, column, file } = node;
  return createFrontendTokenFromParts(
    typeCode,
    type,
    value,
    line,
    column,
    file,
  );
}

function createFrontendTokenFromParts(
  typeCode: GenericTokenKindCode,
  _type: string,
  value: string,
  line: number,
  column: number,
  file: string,
): Token {
  if (
    typeCode <= GENERIC_TOKEN_KEYWORD ||
    typeCode === GENERIC_TOKEN_NULLPTR
  ) {
    return {
      type: _type as TokenType,
      lexeme: value,
      literal: null,
      line,
      column,
      file,
    } as Token;
  }

  switch (typeCode) {
    case GENERIC_TOKEN_INTERPOLATED_STRING:
      return {
        type: TokenType.InterpolatedStringLiteral,
        lexeme: value,
        literal: value,
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

function parseNumber(raw: string): number {
  const rawLength = raw.length;
  const firstCode = raw.charCodeAt(0);
  if (rawLength === 1) {
    if (firstCode >= 48 && firstCode <= 57) {
      return firstCode - 48;
    }
  }
  if (rawLength === 2 && firstCode >= 48 && firstCode <= 57) {
    const secondCode = raw.charCodeAt(1);
    if (secondCode >= 48 && secondCode <= 57) {
      return (firstCode - 48) * 10 + secondCode - 48;
    }
  }
  if (rawLength === 3 && firstCode >= 48 && firstCode <= 57) {
    const secondCode = raw.charCodeAt(1);
    const thirdCode = raw.charCodeAt(2);
    if (
      secondCode >= 48 &&
      secondCode <= 57 &&
      thirdCode >= 48 &&
      thirdCode <= 57
    ) {
      return ((firstCode - 48) * 10 + secondCode - 48) * 10 + thirdCode - 48;
    }
  }
  if (rawLength === 4 && firstCode >= 48 && firstCode <= 57) {
    const secondCode = raw.charCodeAt(1);
    const thirdCode = raw.charCodeAt(2);
    const fourthCode = raw.charCodeAt(3);
    if (
      secondCode >= 48 &&
      secondCode <= 57 &&
      thirdCode >= 48 &&
      thirdCode <= 57 &&
      fourthCode >= 48 &&
      fourthCode <= 57
    ) {
      return (
        (((firstCode - 48) * 10 + secondCode - 48) * 10 + thirdCode - 48) *
          10 +
        fourthCode -
        48
      );
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
