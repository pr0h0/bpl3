import { resolve } from "path";
import { GrammarParser } from "../../grammar/GrammarParser";
import { GenericParser, type TokenNode } from "../../grammar/GenericParser";
import type { Grammar } from "../../grammar/types";
import { Token } from "./Token";
import { TokenType } from "./TokenType";

let cachedGrammar: Grammar | null = null;

function loadGrammar(): Grammar {
  if (cachedGrammar) return cachedGrammar;
  const grammarPath = resolve(__dirname, "../../grammar/grammar.bpl");
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
  const comments = extractComments(source, filePath);
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

function extractComments(source: string, filePath: string): Token[] {
  const comments: Token[] = [];
  const lines = source.split("\n");

  let inBlockComment = false;
  let blockCommentStart = { line: 0, column: 0 };
  let blockCommentContent = "";

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] || "";
    let col = 0;

    while (col < line.length) {
      // Check for block comment start
      if (!inBlockComment && line.substring(col, col + 3) === "###") {
        inBlockComment = true;
        blockCommentStart = { line: lineNum + 1, column: col + 1 };
        blockCommentContent = "###";
        col += 3;
        continue;
      }

      // Check for block comment end
      if (inBlockComment && line.substring(col, col + 3) === "###") {
        blockCommentContent += "###";
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
        col += 3;
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

  if (type === "NullLiteral") {
    return new Token(TokenType.Null, value, null, line, column, file);
  }

  if (type === "NullptrLiteral") {
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
  import: TokenType.Import,
  from: TokenType.From,
  export: TokenType.Export,
  extern: TokenType.Extern,
  asm: TokenType.Asm,
  loop: TokenType.Loop,
  if: TokenType.If,
  else: TokenType.Else,
  break: TokenType.Break,
  continue: TokenType.Continue,
  try: TokenType.Try,
  catch: TokenType.Catch,
  catchOther: TokenType.CatchOther,
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
  try {
    return JSON.parse(raw);
  } catch {
    return raw.slice(1, -1);
  }
}

function decodeChar(raw: string): string {
  const inner = raw.slice(1, -1);
  if (inner.startsWith("\\")) {
    switch (inner[1]) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "\\":
        return "\\";
      case "'":
        return "'";
      case '"':
        return '"';
      case "0":
        return "\0";
      default:
        return inner[1] ?? "";
    }
  }
  return inner;
}
