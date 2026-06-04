import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TokenType } from "../compiler/frontend/TokenType";

import type { Token } from "../compiler/frontend/Token";
function tokenize(source: string): Token[] {
  return lexWithGrammar(source, "test.bpl");
}

describe("Lexer - Extended Tests", () => {
  describe("Keywords", () => {
    it("keeps GenericParser keyword recognition aligned with GrammarLexer keyword tokens", () => {
      const genericParserSource = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const grammarLexerSource = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const keywordSetMatch = genericParserSource.match(
        /const KEYWORDS = new Set\(\[([\s\S]*?)\]\);/,
      );
      const keywordMapMatch = grammarLexerSource.match(
        /const keywordMap:[\s\S]*?= \{([\s\S]*?)\};/,
      );

      expect(keywordSetMatch).not.toBeNull();
      expect(keywordMapMatch).not.toBeNull();

      const genericKeywords = new Set(
        [...keywordSetMatch![1]!.matchAll(/"([^"]+)"/g)].map(
          (match) => match[1],
        ),
      );
      const converterKeywords = [
        ...keywordMapMatch![1]!.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):/gm),
      ].map((match) => match[1]);

      expect(
        converterKeywords.filter((name) => !genericKeywords.has(name)),
      ).toEqual([]);
    });

    it("checks identifier literal and keyword candidates by first character", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private matchIdentifierOrKeyword");
      const end = source.indexOf("private scanIdentifierEnd", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const matcherSource = source.slice(start, end);
      expect(source).toContain("const KEYWORDS = new Set");
      expect(source).toContain("const KEYWORD_START_CODES");
      expect(source).not.toContain("function canStartKeyword");
      expect(matcherSource).toContain("const firstCode =");
      expect(matcherSource).toContain("this.source.charCodeAt(start)");
      expect(matcherSource).toContain("firstCode === 116");
      expect(matcherSource).toContain("firstCode === 102");
      expect(matcherSource).toContain("firstCode === 110");
      expect(matcherSource).toContain(
        "KEYWORD_START_CODES[firstCode] === true && KEYWORDS.has(value)",
      );
    });

    it("should tokenize 'frame' keyword", () => {
      const tokens = tokenize("frame");
      expect(tokens[0]!.type).toBe(TokenType.Frame);
    });

    it("should tokenize 'struct' keyword", () => {
      const tokens = tokenize("struct");
      expect(tokens[0]!.type).toBe(TokenType.Struct);
    });

    it("should tokenize 'enum' keyword", () => {
      const tokens = tokenize("enum");
      expect(tokens[0]!.type).toBe(TokenType.Enum);
    });

    it("should tokenize 'if' keyword", () => {
      const tokens = tokenize("if");
      expect(tokens[0]!.type).toBe(TokenType.If);
    });

    it("should tokenize 'else' keyword", () => {
      const tokens = tokenize("else");
      expect(tokens[0]!.type).toBe(TokenType.Else);
    });

    it("should tokenize 'loop' keyword", () => {
      const tokens = tokenize("loop");
      expect(tokens[0]!.type).toBe(TokenType.Loop);
    });

    it("should tokenize 'return' keyword", () => {
      const tokens = tokenize("return");
      expect(tokens[0]!.type).toBe(TokenType.Return);
    });

    it("should tokenize 'break' keyword", () => {
      const tokens = tokenize("break");
      expect(tokens[0]!.type).toBe(TokenType.Break);
    });

    it("should tokenize 'continue' keyword", () => {
      const tokens = tokenize("continue");
      expect(tokens[0]!.type).toBe(TokenType.Continue);
    });

    it("should tokenize 'switch' keyword", () => {
      const tokens = tokenize("switch");
      expect(tokens[0]!.type).toBe(TokenType.Switch);
    });

    it("should tokenize 'case' keyword", () => {
      const tokens = tokenize("case");
      expect(tokens[0]!.type).toBe(TokenType.Case);
    });

    it("should tokenize 'default' keyword", () => {
      const tokens = tokenize("default");
      expect(tokens[0]!.type).toBe(TokenType.Default);
    });

    it("should tokenize 'local' keyword", () => {
      const tokens = tokenize("local");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should tokenize 'ret' keyword", () => {
      const tokens = tokenize("ret");
      expect(tokens[0]!.type).toBe(TokenType.Ret);
    });

    it("should tokenize 'import' keyword", () => {
      const tokens = tokenize("import");
      expect(tokens[0]!.type).toBe(TokenType.Import);
    });

    it("should tokenize 'export' keyword", () => {
      const tokens = tokenize("export");
      expect(tokens[0]!.type).toBe(TokenType.Export);
    });

    it("should tokenize 'from' keyword", () => {
      const tokens = tokenize("from");
      expect(tokens[0]!.type).toBe(TokenType.From);
    });

    it("should tokenize 'as' keyword", () => {
      const tokens = tokenize("as");
      expect(tokens[0]!.type).toBe(TokenType.As);
    });

    it("should tokenize 'type' keyword", () => {
      const tokens = tokenize("type");
      expect(tokens[0]!.type).toBe(TokenType.Type);
    });

    it("should tokenize 'cast' keyword", () => {
      const tokens = tokenize("cast");
      expect(tokens[0]!.type).toBe(TokenType.Cast);
    });

    it("should tokenize 'sizeof' keyword", () => {
      const tokens = tokenize("sizeof");
      expect(tokens[0]!.type).toBe(TokenType.Sizeof);
    });

    it("should tokenize 'true' keyword", () => {
      const tokens = tokenize("true");
      expect(tokens[0]!.type).toBe(TokenType.True);
    });

    it("should tokenize 'false' keyword", () => {
      const tokens = tokenize("false");
      expect(tokens[0]!.type).toBe(TokenType.False);
    });

    it("should tokenize 'nullptr' keyword", () => {
      const tokens = tokenize("nullptr");
      expect(tokens[0]!.type).toBe(TokenType.Nullptr);
    });

    it("should tokenize 'this' keyword", () => {
      const tokens = tokenize("this");
      expect(tokens[0]!.type).toBe(TokenType.This);
    });

    it("should tokenize 'extern' keyword", () => {
      const tokens = tokenize("extern");
      expect(tokens[0]!.type).toBe(TokenType.Extern);
    });
  });

  describe("Operators", () => {
    it("keeps punctuator lexing on a first-character candidate path", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private matchPunctuator");
      const end = source.indexOf("private execAt", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const methodSource = source.slice(start, end);
      expect(source).toContain("PUNCTUATORS_BY_FIRST_CHAR");
      expect(methodSource).toContain("PUNCTUATORS_BY_FIRST_CHAR.get");
      expect(methodSource).not.toContain("for (const punct of this.punctuators)");
    });

    it("should tokenize '+' operator", () => {
      const tokens = tokenize("+");
      expect(tokens[0]!.type).toBe(TokenType.Plus);
    });

    it("should tokenize '-' operator", () => {
      const tokens = tokenize("-");
      expect(tokens[0]!.type).toBe(TokenType.Minus);
    });

    it("should tokenize '*' operator", () => {
      const tokens = tokenize("*");
      expect(tokens[0]!.type).toBe(TokenType.Star);
    });

    it("should tokenize '/' operator", () => {
      const tokens = tokenize("/");
      expect(tokens[0]!.type).toBe(TokenType.Slash);
    });

    it("should tokenize '%' operator", () => {
      const tokens = tokenize("%");
      expect(tokens[0]!.type).toBe(TokenType.Percent);
    });

    it("should tokenize '+=' operator", () => {
      const tokens = tokenize("+=");
      expect(tokens[0]!.type).toBe(TokenType.PlusEqual);
    });

    it("should tokenize '-=' operator", () => {
      const tokens = tokenize("-=");
      expect(tokens[0]!.type).toBe(TokenType.MinusEqual);
    });

    it("should tokenize '*=' operator", () => {
      const tokens = tokenize("*=");
      expect(tokens[0]!.type).toBe(TokenType.StarEqual);
    });

    it("should tokenize '/=' operator", () => {
      const tokens = tokenize("/=");
      expect(tokens[0]!.type).toBe(TokenType.SlashEqual);
    });

    it("should tokenize '==' operator", () => {
      const tokens = tokenize("==");
      expect(tokens[0]!.type).toBe(TokenType.EqualEqual);
    });

    it("should tokenize '!=' operator", () => {
      const tokens = tokenize("!=");
      expect(tokens[0]!.type).toBe(TokenType.BangEqual);
    });

    it("should tokenize '<' operator", () => {
      const tokens = tokenize("<");
      expect(tokens[0]!.type).toBe(TokenType.Less);
    });

    it("should tokenize '>' operator", () => {
      const tokens = tokenize(">");
      expect(tokens[0]!.type).toBe(TokenType.Greater);
    });

    it("should tokenize '<=' operator", () => {
      const tokens = tokenize("<=");
      expect(tokens[0]!.type).toBe(TokenType.LessEqual);
    });

    it("should tokenize '>=' operator", () => {
      const tokens = tokenize(">=");
      expect(tokens[0]!.type).toBe(TokenType.GreaterEqual);
    });

    it("should tokenize '&&' operator", () => {
      const tokens = tokenize("&&");
      expect(tokens[0]!.type).toBe(TokenType.AndAnd);
    });

    it("should tokenize '||' operator", () => {
      const tokens = tokenize("||");
      expect(tokens[0]!.type).toBe(TokenType.OrOr);
    });

    it("should tokenize '!' operator", () => {
      const tokens = tokenize("!");
      expect(tokens[0]!.type).toBe(TokenType.Bang);
    });

    it("should tokenize '&' operator", () => {
      const tokens = tokenize("&");
      expect(tokens[0]!.type).toBe(TokenType.Ampersand);
    });

    it("should tokenize '|' operator", () => {
      const tokens = tokenize("|");
      expect(tokens[0]!.type).toBe(TokenType.Pipe);
    });

    it("should tokenize '^' operator", () => {
      const tokens = tokenize("^");
      expect(tokens[0]!.type).toBe(TokenType.Caret);
    });

    it("should tokenize '~' operator", () => {
      const tokens = tokenize("~");
      expect(tokens[0]!.type).toBe(TokenType.Tilde);
    });

    it("should tokenize '<<' operator", () => {
      const tokens = tokenize("<<");
      expect(tokens[0]!.type).toBe(TokenType.LessLess);
    });

    it("should tokenize '>>' operator", () => {
      const tokens = tokenize(">>");
      expect(tokens[0]!.type).toBe(TokenType.GreaterGreater);
    });
  });

  describe("Delimiters", () => {
    it("should tokenize '(' delimiter", () => {
      const tokens = tokenize("(");
      expect(tokens[0]!.type).toBe(TokenType.LeftParen);
    });

    it("should tokenize ')' delimiter", () => {
      const tokens = tokenize(")");
      expect(tokens[0]!.type).toBe(TokenType.RightParen);
    });

    it("should tokenize '{' delimiter", () => {
      const tokens = tokenize("{");
      expect(tokens[0]!.type).toBe(TokenType.LeftBrace);
    });

    it("should tokenize '}' delimiter", () => {
      const tokens = tokenize("}");
      expect(tokens[0]!.type).toBe(TokenType.RightBrace);
    });

    it("should tokenize '[' delimiter", () => {
      const tokens = tokenize("[");
      expect(tokens[0]!.type).toBe(TokenType.LeftBracket);
    });

    it("should tokenize ']' delimiter", () => {
      const tokens = tokenize("]");
      expect(tokens[0]!.type).toBe(TokenType.RightBracket);
    });

    it("should tokenize ',' delimiter", () => {
      const tokens = tokenize(",");
      expect(tokens[0]!.type).toBe(TokenType.Comma);
    });

    it("should tokenize ';' delimiter", () => {
      const tokens = tokenize(";");
      expect(tokens[0]!.type).toBe(TokenType.Semicolon);
    });

    it("should tokenize ':' delimiter", () => {
      const tokens = tokenize(":");
      expect(tokens[0]!.type).toBe(TokenType.Colon);
    });

    it("should tokenize '.' delimiter", () => {
      const tokens = tokenize(".");
      expect(tokens[0]!.type).toBe(TokenType.Dot);
    });
  });

  describe("Identifiers", () => {
    it("reuses module-level literal regexes and scans identifiers manually", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const matcherStart = source.indexOf("private matchStringLiteral");
      const matcherEnd = source.indexOf("private matchPunctuator", matcherStart);

      expect(matcherStart).toBeGreaterThanOrEqual(0);
      expect(matcherEnd).toBeGreaterThan(matcherStart);

      const matcherSource = source.slice(matcherStart, matcherEnd);
      expect(source).toContain("STRING_LITERAL_PATTERN");
      expect(source).toContain("CHAR_LITERAL_PATTERN");
      expect(source).toContain("HEX_NUMBER_LITERAL_PATTERN");
      expect(source).toContain("BINARY_NUMBER_LITERAL_PATTERN");
      expect(source).toContain("OCTAL_NUMBER_LITERAL_PATTERN");
      expect(source).toContain("DECIMAL_NUMBER_LITERAL_PATTERN");
      expect(source).toContain("function isIdentifierPart");
      expect(source).toContain("private scanIdentifierEnd");
      expect(matcherSource).not.toContain("const regex = /");
      expect(matcherSource).not.toContain("const patterns = [");
      expect(matcherSource).not.toContain("this.execAt(/[A-Za-z_]");
      expect(matcherSource).not.toContain("IDENTIFIER_PATTERN");
    });

    it("guards hot token regexes by first character before execAt", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const matcherStart = source.indexOf("private matchStringLiteral");
      const matcherEnd = source.indexOf("private matchPunctuator", matcherStart);

      expect(matcherStart).toBeGreaterThanOrEqual(0);
      expect(matcherEnd).toBeGreaterThan(matcherStart);

      const matcherSource = source.slice(matcherStart, matcherEnd);
      expect(source).toContain("isAsciiDigit");
      expect(source).toContain("isIdentifierStartCode");
      expect(matcherSource).toContain('if (firstChar === "\\"")');
      expect(matcherSource).toContain("if (firstChar !== \"'\") return null");
      expect(matcherSource).toContain("if (!isAsciiDigit(firstChar)) return null");
      expect(matcherSource).toContain(
        "if (!isIdentifierStartCode(firstCode)) return null",
      );
    });

    it("converts identifier token nodes without a defensive keyword lookup", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf('if (type === "Identifier")');
      const end = source.indexOf('if (type === "StringLiteral")', start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const identifierSource = source.slice(start, end);
      expect(identifierSource).toContain("TokenType.Identifier");
      expect(identifierSource).not.toContain("keywordMap");
    });

    it("converts keyword and punctuator token nodes through direct map lookups", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function convertTokenNodeToToken");
      const end = source.indexOf("const keywordMap", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const converterSource = source.slice(start, end);
      expect(converterSource).toContain(
        "keywordMap[value] ?? TokenType.Identifier",
      );
      expect(converterSource).toContain(
        "punctuatorMap[value] ?? TokenType.Unknown",
      );
      expect(converterSource).not.toContain("keywordToTokenType(value)");
      expect(converterSource).not.toContain("punctuatorToTokenType(value)");
    });

    it("should tokenize simple identifier", () => {
      const tokens = tokenize("myVariable");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("myVariable");
    });

    it("should tokenize identifier with underscores", () => {
      const tokens = tokenize("my_variable");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("my_variable");
    });

    it("should tokenize identifier with numbers", () => {
      const tokens = tokenize("var123");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("var123");
    });

    it("should tokenize camelCase identifier", () => {
      const tokens = tokenize("myVariableName");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("myVariableName");
    });

    it("should tokenize PascalCase identifier", () => {
      const tokens = tokenize("MyClassName");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("MyClassName");
    });
  });

  describe("Number Literals", () => {
    it("dispatches numeric regex matching by literal prefix", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private matchNumberLiteral");
      const end = source.indexOf("private matchIdentifierOrKeyword", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const methodSource = source.slice(start, end);
      expect(source).toContain("HEX_NUMBER_LITERAL_PATTERN");
      expect(source).toContain("BINARY_NUMBER_LITERAL_PATTERN");
      expect(source).toContain("OCTAL_NUMBER_LITERAL_PATTERN");
      expect(source).toContain("DECIMAL_NUMBER_LITERAL_PATTERN");
      expect(methodSource).toContain("const secondChar");
      expect(methodSource).toContain("DECIMAL_NUMBER_LITERAL_PATTERN");
      expect(methodSource).not.toContain(
        "for (const pattern of NUMBER_LITERAL_PATTERNS)",
      );
    });

    it("should tokenize decimal integer", () => {
      const tokens = tokenize("123");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("123");
    });

    it("should tokenize hexadecimal integer", () => {
      const tokens = tokenize("0xFF");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("0xFF");
    });

    it("should tokenize binary integer", () => {
      const tokens = tokenize("0b1010");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("0b1010");
    });

    it("should tokenize octal integer", () => {
      const tokens = tokenize("0o755");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("0o755");
    });

    it("should tokenize float with decimal point", () => {
      const tokens = tokenize("3.14");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("3.14");
    });
  });

  describe("String Literals", () => {
    it("should tokenize simple string", () => {
      const tokens = tokenize('"hello"');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('"hello"');
    });

    it("should tokenize string with escape sequences", () => {
      const tokens = tokenize('"hello\\nworld"');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('"hello\\nworld"');
    });

    it("should tokenize string with quotes", () => {
      const tokens = tokenize('"hello \\"world\\""');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('"hello \\"world\\""');
    });

    it("should tokenize empty string", () => {
      const tokens = tokenize('""');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('""');
    });
  });

  describe("Character Literals", () => {
    it("should tokenize simple character", () => {
      const tokens = tokenize("'a'");
      expect(tokens[0]!.type).toBe(TokenType.CharLiteral);
      expect(tokens[0]!.lexeme).toBe("'a'");
    });

    it("should tokenize escaped character", () => {
      const tokens = tokenize("'\\n'");
      expect(tokens[0]!.type).toBe(TokenType.CharLiteral);
      expect(tokens[0]!.lexeme).toBe("'\\n'");
    });

    it("should tokenize tab character", () => {
      const tokens = tokenize("'\\t'");
      expect(tokens[0]!.type).toBe(TokenType.CharLiteral);
      expect(tokens[0]!.lexeme).toBe("'\\t'");
    });
  });

  describe("Comments", () => {
    it("keeps GenericParser comment-free whitespace scanning off comment branches", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const methodStart = source.indexOf("private skipWhitespaceAndComments");
      const methodEnd = source.indexOf("private matchStringLiteral", methodStart);

      expect(methodStart).toBeGreaterThanOrEqual(0);
      expect(methodEnd).toBeGreaterThan(methodStart);

      const methodSource = source.slice(methodStart, methodEnd);
      expect(source).toContain("private readonly hasCommentMarker: boolean");
      expect(source).toContain('this.hasCommentMarker = source.includes("#")');
      expect(source).toContain("private skipWhitespaceOnly");
      expect(methodSource).toContain("if (!this.hasCommentMarker)");
      expect(methodSource).toContain("this.skipWhitespaceOnly()");
      expect(methodSource.indexOf("skipWhitespaceOnly")).toBeLessThan(
        methodSource.indexOf("startsWith(\"/#\""),
      );
    });

    it("keeps comment-free lexing off the comment extraction path", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("export function lexWithGrammar");
      const end = source.indexOf("function extractComments", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const methodSource = source.slice(start, end);
      const markerCheckIndex = methodSource.indexOf('source.includes("#")');
      const extractionIndex = methodSource.indexOf("extractComments(");

      expect(markerCheckIndex).toBeGreaterThanOrEqual(0);
      expect(extractionIndex).toBeGreaterThan(markerCheckIndex);
      expect(methodSource).toContain("if (hasCommentMarker)");
      expect(methodSource).not.toContain(
        "const comments = extractComments(source, filePath, tokens);\n  mapped.push(...comments);\n\n  // Sort by position\n  mapped.sort",
      );
    });

    it("keeps grammar token conversion on a preallocated loop", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("export function lexWithGrammar");
      const end = source.indexOf("function extractComments", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const methodSource = source.slice(start, end);
      expect(methodSource).toContain("new Array<Token>(tokens.length)");
      expect(methodSource).toContain("mapped[i] = convertTokenNodeToToken");
      expect(methodSource).not.toContain("tokens.map(convertTokenNodeToToken)");
    });

    it("should skip single-line comments", () => {
      const tokens = tokenize("# This is a comment\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Comment);
      expect(tokens[1]!.type).toBe(TokenType.Local);
    });

    it("should skip multi-line comments", () => {
      const tokens = tokenize("/# This is\na comment #/\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Comment);
      expect(tokens[1]!.type).toBe(TokenType.Local);
    });

    it("should handle nested comments if supported", () => {
      const tokens = tokenize("### outer ### inner ### ###\nlocal");
      // Behavior depends on if nested comments are supported
      expect(tokens.some((t) => t.type === TokenType.Local)).toBe(true);
    });
  });

  describe("Whitespace Handling", () => {
    it("should skip spaces", () => {
      const tokens = tokenize("   local");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should skip tabs", () => {
      const tokens = tokenize("\t\tlocal");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should skip newlines", () => {
      const tokens = tokenize("\n\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should skip carriage returns", () => {
      const tokens = tokenize("\r\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });
  });

  describe("Complex Expressions", () => {
    it("should tokenize arithmetic expression", () => {
      const tokens = tokenize("a + b * c");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Plus);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Star);
      expect(tokens[4]!.type).toBe(TokenType.Identifier);
    });

    it("should tokenize function call", () => {
      const tokens = tokenize("foo(a, b)");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.LeftParen);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Comma);
      expect(tokens[4]!.type).toBe(TokenType.Identifier);
      expect(tokens[5]!.type).toBe(TokenType.RightParen);
    });

    it("should tokenize array access", () => {
      const tokens = tokenize("arr[10]");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.LeftBracket);
      expect(tokens[2]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[3]!.type).toBe(TokenType.RightBracket);
    });

    it("should tokenize member access", () => {
      const tokens = tokenize("obj.field");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Dot);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
    });
  });

  describe("Type Annotations", () => {
    it("should tokenize simple type", () => {
      const tokens = tokenize("x: int");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Colon);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
    });

    it("should tokenize pointer type", () => {
      const tokens = tokenize("p: *int");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Colon);
      expect(tokens[2]!.type).toBe(TokenType.Star);
      expect(tokens[3]!.type).toBe(TokenType.Identifier);
    });

    it("should tokenize array type", () => {
      const tokens = tokenize("arr: int[10]");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Colon);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.LeftBracket);
      expect(tokens[4]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[5]!.type).toBe(TokenType.RightBracket);
    });
  });

  describe("Generic Syntax", () => {
    it("should tokenize generic type parameter", () => {
      const tokens = tokenize("Box<T>");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Less);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Greater);
    });

    it("should tokenize multiple generic parameters", () => {
      const tokens = tokenize("Map<K, V>");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Less);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Comma);
      expect(tokens[4]!.type).toBe(TokenType.Identifier);
      expect(tokens[5]!.type).toBe(TokenType.Greater);
    });
  });

  describe("Error Cases", () => {
    it("should handle invalid characters gracefully", () => {
      expect(() => tokenize("\\")).toThrow();
    });

    it("should handle unterminated string", () => {
      expect(() => tokenize('"unterminated')).toThrow();
    });

    it("should handle unterminated character literal", () => {
      expect(() => tokenize("'a")).toThrow();
    });

    it("should handle invalid number format", () => {
      const tokens = tokenize("0b1021");
      // parse as 0b10 21
      expect(tokens.length).toBeGreaterThan(1);
    });
  });

  describe("Position Tracking", () => {
    it("should track line numbers correctly", () => {
      const tokens = tokenize("line1\nline2");
      expect(tokens[0]!.line).toBe(1);
      expect(tokens[1]!.line).toBe(2);
    });

    it("should track column numbers correctly", () => {
      const tokens = tokenize("abc def");
      expect(tokens[0]!.column).toBe(1);
      expect(tokens[1]!.column).toBe(5);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty input", () => {
      const tokens = tokenize("");
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle only whitespace", () => {
      const tokens = tokenize("   \n\t  ");
      // Should produce minimal tokens (maybe just EOF)
      expect(tokens).toBeDefined();
    });

    it("should handle only comments", () => {
      const tokens = tokenize("// comment\n/* comment */");
      // Should produce minimal tokens
      expect(tokens).toBeDefined();
    });

    it("should distinguish between similar operators", () => {
      const tokens = tokenize("< <= << > >= >>");
      expect(tokens[0]!.type).toBe(TokenType.Less);
      expect(tokens[1]!.type).toBe(TokenType.LessEqual);
      expect(tokens[2]!.type).toBe(TokenType.LessLess);
      expect(tokens[3]!.type).toBe(TokenType.Greater);
      expect(tokens[4]!.type).toBe(TokenType.GreaterEqual);
      expect(tokens[5]!.type).toBe(TokenType.GreaterGreater);
    });
  });
});
