import { existsSync } from "fs";

import { resolveBplPath, getBplHome } from "../common/PathResolver";
import { CompilerError } from "../common/CompilerError";
import { GenericParser, type TokenNode } from "../../grammar/GenericParser";
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
  const genericParser = new GenericParser(grammar, source, filePath);
  const { tokens } = genericParser.parse();

  const mapped = tokens.map(convertTokenNodeToToken);

  // Extract comments from source
  const comments = extractComments(source, filePath, tokens);
  mapped.push(...comments);

  // Sort by position
  mapped.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  const last = mapped[mapped.length - 1];
  const eofLine = last ? last.line : 1;
  const eofColumn = last ? last.column + last.lexeme.length : 1;

  mapped.push(new Token(TokenType.EOF, "", null, eofLine, eofColumn, filePath));
  return mapped;
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
  const { type, value, line, column, file } = node;

  if (type === "Identifier") {
    if (keywordMap[value]) {
      return new Token(keywordMap[value], value, null, line, column, file);
    }
    return new Token(TokenType.Identifier, value, null, line, column, file);
  }

  if (type === "StringLiteral") {
    return new Token(
      TokenType.StringLiteral,
      value,
      decodeString(value),
      line,
      column,
      file,
    );
  }

  if (type === "InterpolatedStringLiteral") {
    return new Token(
      TokenType.InterpolatedStringLiteral,
      value,
      value, // Keep raw value
      line,
      column,
      file,
    );
  }

  if (type === "CharLiteral") {
    return new Token(
      TokenType.CharLiteral,
      value,
      decodeChar(value),
      line,
      column,
      file,
    );
  }

  if (type === "NumberLiteral") {
    return new Token(
      TokenType.NumberLiteral,
      value,
      parseNumber(value),
      line,
      column,
      file,
    );
  }

  if (type === "BoolLiteral") {
    const literal = value === "true";
    return new Token(
      literal ? TokenType.True : TokenType.False,
      value,
      literal,
      line,
      column,
      file,
    );
  }

  if (type === "NullLiteral" || type === "NullptrLiteral") {
    return new Token(TokenType.Nullptr, value, null, line, column, file);
  }

  if (type === "Keyword") {
    const tokenType = keywordToTokenType(value);
    return new Token(tokenType, value, null, line, column, file);
  }

  if (type === "Punctuator") {
    const tokenType = punctuatorToTokenType(value);
    return new Token(tokenType, value, null, line, column, file);
  }

  return new Token(TokenType.Unknown, value, null, line, column, file);
}

const keywordMap: Record<string, TokenType> = {
  global: TokenType.Global,
  local: TokenType.Local,
  const: TokenType.Const,
  type: TokenType.Type,
  frame: TokenType.Frame,
  static: TokenType.Static,
  ret: TokenType.Ret,
  struct: TokenType.Struct,
  enum: TokenType.Enum,
  import: TokenType.Import,
  from: TokenType.From,
  export: TokenType.Export,
  extern: TokenType.Extern,
  asm: TokenType.Asm,
  as: TokenType.As,
  this: TokenType.This,
  loop: TokenType.Loop,
  if: TokenType.If,
  else: TokenType.Else,
  break: TokenType.Break,
  continue: TokenType.Continue,
  try: TokenType.Try,
  catch: TokenType.Catch,
  return: TokenType.Return,
  throw: TokenType.Throw,
  switch: TokenType.Switch,
  case: TokenType.Case,
  default: TokenType.Default,
  cast: TokenType.Cast,
  sizeof: TokenType.Sizeof,
  match: TokenType.Match,
  Func: TokenType.Func,
};

function keywordToTokenType(keyword: string): TokenType {
  return keywordMap[keyword] ?? TokenType.Identifier;
}

const punctuatorMap: Record<string, TokenType> = {
  "{": TokenType.LeftBrace,
  "}": TokenType.RightBrace,
  "(": TokenType.LeftParen,
  ")": TokenType.RightParen,
  "[": TokenType.LeftBracket,
  "]": TokenType.RightBracket,
  ",": TokenType.Comma,
  ":": TokenType.Colon,
  ";": TokenType.Semicolon,
  "?": TokenType.Question,
  "~": TokenType.Tilde,
  "...": TokenType.Ellipsis,
  ".": TokenType.Dot,
  "==": TokenType.EqualEqual,
  "!=": TokenType.BangEqual,
  ">=": TokenType.GreaterEqual,
  "<=": TokenType.LessEqual,
  "<<": TokenType.LessLess,
  ">>": TokenType.GreaterGreater,
  "&&": TokenType.AndAnd,
  "||": TokenType.OrOr,
  "++": TokenType.PlusPlus,
  "--": TokenType.MinusMinus,
  "+=": TokenType.PlusEqual,
  "-=": TokenType.MinusEqual,
  "*=": TokenType.StarEqual,
  "/=": TokenType.SlashEqual,
  "%=": TokenType.PercentEqual,
  "&=": TokenType.AmpersandEqual,
  "|=": TokenType.PipeEqual,
  "^=": TokenType.CaretEqual,
  "=": TokenType.Equal,
  "+": TokenType.Plus,
  "-": TokenType.Minus,
  "*": TokenType.Star,
  "/": TokenType.Slash,
  "%": TokenType.Percent,
  "&": TokenType.Ampersand,
  "|": TokenType.Pipe,
  "^": TokenType.Caret,
  "!": TokenType.Bang,
  "<": TokenType.Less,
  ">": TokenType.Greater,
};

function punctuatorToTokenType(value: string): TokenType {
  return punctuatorMap[value] ?? TokenType.Unknown;
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/_/g, "");
  return Number(cleaned);
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
