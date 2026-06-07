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
  describe("Numbers", () => {
    it("keeps single-digit number conversion before generic Number parsing", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function parseNumber");
      const end = source.indexOf("\nfunction decodeString", start);
      const helperSource = source.slice(start, end);

      expect(tokenize("7")[0]!.literal).toBe(7);
      expect(helperSource).toContain("const rawLength = raw.length;");
      expect(helperSource).toContain("if (rawLength === 1)");
      expect(helperSource).toContain("return firstCode - 48");
      expect(helperSource.indexOf("rawLength === 1")).toBeLessThan(
        helperSource.indexOf("Number(raw)"),
      );
    });
  });

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
      const converterKeywords = [
        "Func",
        "as",
        "asm",
        "break",
        "case",
        "cast",
        "catch",
        "const",
        "continue",
        "default",
        "else",
        "enum",
        "export",
        "extern",
        "frame",
        "from",
        "global",
        "if",
        "import",
        "local",
        "loop",
        "match",
        "ret",
        "return",
        "sizeof",
        "static",
        "struct",
        "switch",
        "this",
        "throw",
        "try",
        "type",
      ];

      for (const keyword of converterKeywords) {
        const tokens = tokenize(keyword);
        expect(tokens[0]!.type).not.toBe(TokenType.Identifier);
        expect(tokens[0]!.lexeme).toBe(keyword);
      }
      expect(genericParserSource).toContain("function classifyIdentifierLike");
      expect(grammarLexerSource).toContain(
        "typeCode <= GENERIC_TOKEN_KEYWORD",
      );
    });

    it("checks identifier keyword candidates only for possible keyword starts", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private matchIdentifierOrKeyword");
      const end = source.indexOf("private scanIdentifierEnd", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const matcherSource = source.slice(start, end);
      expect(source).toContain("function classifyIdentifierLike");
      expect(source).not.toContain("const KEYWORDS = new Set");
      expect(source).not.toContain("function canStartKeyword");
      expect(source).not.toContain("KEYWORD_START_CODE_MASK");
      expect(matcherSource).toContain("firstCode: number");
      expect(matcherSource).not.toContain("this.source.charCodeAt(start)");
      expect(matcherSource).toContain("switch (firstCode)");
      expect(matcherSource).toContain("case 70:");
      expect(matcherSource).toContain("case 116:");
      expect(matcherSource).toContain(
        "classifyIdentifierLike(firstCode, value)",
      );
      expect(matcherSource.indexOf("switch (firstCode)")).toBeLessThan(
        matcherSource.indexOf("classifyIdentifierLike(firstCode, value)"),
      );
      expect(matcherSource).toContain("value.charCodeAt(1) !== 105");
      expect(matcherSource).toContain("value.charCodeAt(1) !== 110");
      expect(matcherSource).toContain("value.charCodeAt(1) !== 101");
      expect(matcherSource).not.toContain("KEYWORDS.has(value)");
      expect(
        tokenize("first second int")
          .slice(0, 3)
          .map((token) => token.type),
      ).toEqual([
        TokenType.Identifier,
        TokenType.Identifier,
        TokenType.Identifier,
      ]);
    });

    it("classifies keyword candidates by length before literal comparisons", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("function classifyIdentifierLike");
      const end = source.indexOf("function isAsciiDigit", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const classifierSource = source.slice(start, end);
      expect(classifierSource).toContain("switch (value.length)");
      expect(classifierSource.indexOf("switch (value.length)")).toBeLessThan(
        classifierSource.indexOf('value === "continue"'),
      );
      expect(classifierSource.indexOf("switch (value.length)")).toBeLessThan(
        classifierSource.indexOf('value === "nullptr"'),
      );
      expect(tokenize("continue")[0]!.type).toBe(TokenType.Continue);
      expect(tokenize("constant")[0]!.type).toBe(TokenType.Identifier);
      expect(tokenize("nullptr")[0]!.type).toBe(TokenType.Nullptr);
      expect(tokenize("nullish")[0]!.type).toBe(TokenType.Identifier);
    });

    it("emits identifier range tokens through the split emitter helper", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private matchIdentifierOrKeyword");
      const end = source.indexOf("private scanIdentifierEnd", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const matcherSource = source.slice(start, end);
      expect(source).not.toContain("private createTokenFromRange");
      expect(matcherSource).not.toContain("this.createTokenFromRange(");
      expect(matcherSource).toContain("const line = this.line;");
      expect(matcherSource).toContain("const column = this.column;");
      expect(matcherSource).toContain("this.position = end;");
      expect(matcherSource).toContain("this.column += end - start;");
      expect(matcherSource).toContain("return this.emitToken(");

      const tokens = tokenize("local value_1: int;");
      expect(tokens.slice(0, 4).map((token) => token.lexeme)).toEqual([
        "local",
        "value_1",
        ":",
        "int",
      ]);
      expect(tokens[0]!.type).toBe(TokenType.Local);
      expect(tokens[1]!.type).toBe(TokenType.Identifier);
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
    it("keeps punctuator lexing on a direct first-character dispatch path", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private matchPunctuator");
      const end = source.indexOf("private execAt", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const methodSource = source.slice(start, end);
      expect(source).not.toContain("const PUNCTUATORS =");
      expect(source).not.toContain("PUNCTUATORS_BY_FIRST_CHAR");
      expect(source).not.toContain("groupPunctuatorsByFirstChar");
      expect(methodSource).toContain("firstCode: number");
      expect(methodSource).not.toContain(
        "const firstCode = this.source.charCodeAt(this.position);",
      );
      expect(methodSource).toContain("switch (firstCode)");
      expect(methodSource).not.toContain("PUNCTUATORS_BY_FIRST_CHAR.get");
      expect(methodSource).not.toContain(
        "for (const punct of this.punctuators)",
      );
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
      const matcherEnd = source.indexOf(
        "private matchPunctuator",
        matcherStart,
      );

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

    it("reuses source and length while scanning identifier ends", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private scanIdentifierEnd");
      const end = source.indexOf("private matchPunctuator", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const scannerSource = source.slice(start, end);
      expect(scannerSource).toContain("const source = this.source;");
      expect(scannerSource).toContain("const sourceLength = source.length;");
      expect(scannerSource).toContain("index < sourceLength");
      expect(scannerSource).toContain("source.charCodeAt(index)");
    });

    it("guards hot token regexes by first character before execAt", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const matcherStart = source.indexOf("private matchStringLiteral");
      const matcherEnd = source.indexOf(
        "private matchPunctuator",
        matcherStart,
      );

      expect(matcherStart).toBeGreaterThanOrEqual(0);
      expect(matcherEnd).toBeGreaterThan(matcherStart);

      const matcherSource = source.slice(matcherStart, matcherEnd);
      expect(source).toContain("isAsciiDigit");
      expect(source).toContain("isIdentifierStartCode");
      expect(matcherSource).toContain("if (firstChar ===");
      expect(matcherSource).toContain("STRING_LITERAL_PATTERN");
      expect(matcherSource).toContain('if (firstChar !== "\'") return null');
      expect(matcherSource).toContain(
        "if (!isAsciiDigit(firstChar)) return null",
      );
      expect(matcherSource).not.toContain(
        "if (!isIdentifierStartCode(firstCode)) return null",
      );
    });

    it("dispatches token matching by first character before fallback matchers", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const parseStart = source.indexOf("parseWithTokenEmitter");
      const parseEnd = source.indexOf(
        "private skipWhitespaceAndComments",
        parseStart,
      );
      const helperStart = source.indexOf("private matchNextToken");
      const helperEnd = source.indexOf(
        "private matchStringLiteral",
        helperStart,
      );

      expect(parseStart).toBeGreaterThanOrEqual(0);
      expect(parseEnd).toBeGreaterThan(parseStart);
      expect(helperStart).toBeGreaterThan(parseEnd);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const parseSource = source.slice(parseStart, parseEnd);
      const helperSource = source.slice(helperStart, helperEnd);
      expect(parseSource).toContain("this.matchNextToken(emitToken)");
      expect(parseSource).not.toContain(
        "this.matchStringLiteral(emitToken) ||",
      );
      expect(helperSource).toContain(
        "const firstCode = this.source.charCodeAt(this.position);",
      );
      expect(helperSource).toContain("case 34:");
      expect(helperSource).toContain("case 39:");
      expect(helperSource).toContain("case 96:");
      expect(helperSource).toContain("isIdentifierStartCode(firstCode)");
    });

    it("caches source length inside the token emitter loop", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const parseStart = source.indexOf("parseWithTokenEmitter");
      const parseEnd = source.indexOf(
        "private skipWhitespaceAndComments",
        parseStart,
      );

      expect(parseStart).toBeGreaterThanOrEqual(0);
      expect(parseEnd).toBeGreaterThan(parseStart);

      const parseSource = source.slice(parseStart, parseEnd);
      const sourceLength = parseSource.indexOf(
        "const sourceLength = this.source.length;",
      );
      const loop = parseSource.indexOf("while (this.position < sourceLength)");

      expect(sourceLength).toBeGreaterThanOrEqual(0);
      expect(loop).toBeGreaterThan(sourceLength);
    });

    it("keeps generic token collection on a preallocated index cursor", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const parseStart = source.indexOf("parseWithTokenEmitter");
      const parseEnd = source.indexOf(
        "private skipWhitespaceAndComments",
        parseStart,
      );

      expect(parseStart).toBeGreaterThanOrEqual(0);
      expect(parseEnd).toBeGreaterThan(parseStart);

      const parseSource = source.slice(parseStart, parseEnd);
      expect(parseSource).toContain("const estimatedTokenCapacity =");
      expect(parseSource).toContain(
        "const tokens: T[] = new Array<T>(estimatedTokenCapacity);",
      );
      expect(parseSource).toContain("let tokenCount = 0;");
      expect(parseSource).toContain("tokens[tokenCount++] = token;");
      expect(parseSource).toContain("tokens.length = tokenCount;");
      expect(parseSource).not.toContain("tokens.push(token)");

      const tokens = tokenize("local x: int = 1; return x;");
      expect(tokens.map((token) => token.lexeme)).toEqual([
        "local",
        "x",
        ":",
        "int",
        "=",
        "1",
        ";",
        "return",
        "x",
        ";",
        "",
      ]);
    });

    it("threads first character codes into hot token matchers", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const dispatchStart = source.indexOf("private matchNextToken");
      const dispatchEnd = source.indexOf(
        "private matchStringLiteral",
        dispatchStart,
      );
      const identifierStart = source.indexOf(
        "private matchIdentifierOrKeyword",
      );
      const identifierEnd = source.indexOf(
        "private scanIdentifierEnd",
        identifierStart,
      );
      const punctuatorStart = source.indexOf("private matchPunctuator");
      const punctuatorEnd = source.indexOf(
        "private createToken",
        punctuatorStart,
      );

      expect(dispatchStart).toBeGreaterThanOrEqual(0);
      expect(dispatchEnd).toBeGreaterThan(dispatchStart);
      expect(identifierStart).toBeGreaterThan(dispatchEnd);
      expect(identifierEnd).toBeGreaterThan(identifierStart);
      expect(punctuatorStart).toBeGreaterThan(identifierEnd);
      expect(punctuatorEnd).toBeGreaterThan(punctuatorStart);

      const dispatchSource = source.slice(dispatchStart, dispatchEnd);
      const identifierSource = source.slice(identifierStart, identifierEnd);
      const punctuatorSource = source.slice(punctuatorStart, punctuatorEnd);
      expect(dispatchSource).toContain(
        "this.matchIdentifierOrKeyword(emitToken, firstCode)",
      );
      expect(dispatchSource).toContain(
        "this.matchPunctuator(emitToken, firstCode)",
      );
      expect(identifierSource).toContain("firstCode: number");
      expect(identifierSource).not.toContain(
        "const firstCode = this.source.charCodeAt(start);",
      );
      expect(punctuatorSource).toContain("firstCode: number");
      expect(punctuatorSource).not.toContain(
        "const firstCode = this.source.charCodeAt(this.position);",
      );
    });

    it("keeps identifier-start validation in the token dispatch layer", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const dispatchStart = source.indexOf("private matchNextToken");
      const dispatchEnd = source.indexOf(
        "private matchStringLiteral",
        dispatchStart,
      );
      const identifierStart = source.indexOf(
        "private matchIdentifierOrKeyword",
      );
      const identifierEnd = source.indexOf(
        "private scanIdentifierEnd",
        identifierStart,
      );

      expect(dispatchStart).toBeGreaterThanOrEqual(0);
      expect(dispatchEnd).toBeGreaterThan(dispatchStart);
      expect(identifierStart).toBeGreaterThan(dispatchEnd);
      expect(identifierEnd).toBeGreaterThan(identifierStart);

      const dispatchSource = source.slice(dispatchStart, dispatchEnd);
      const identifierSource = source.slice(identifierStart, identifierEnd);
      expect(dispatchSource).toContain("isIdentifierStartCode(firstCode)");
      expect(identifierSource).not.toContain(
        "if (!isIdentifierStartCode(firstCode))",
      );
    });

    it("fast-forwards known newline-free token positions without scanning token text", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const start = source.indexOf("private createToken<T>");
      const end = source.indexOf("private advance", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const createTokenSource = source.slice(start, end);
      expect(createTokenSource).toContain("canContainNewline = false");
      expect(createTokenSource).toContain(
        'if (!canContainNewline || value.indexOf("\\n") === -1)',
      );
      expect(createTokenSource).toContain("this.position += value.length;");
      expect(createTokenSource).toContain("this.column += value.length;");
      expect(createTokenSource).toContain("this.advance(value);");
      expect(
        createTokenSource.indexOf("this.position += value.length;"),
      ).toBeLessThan(createTokenSource.indexOf("this.advance(value);"));

      const stringMatcherStart = source.indexOf(
        "private matchStringLiteral<T>",
      );
      const interpolatedStart = source.indexOf(
        "GENERIC_TOKEN_INTERPOLATED_STRING",
        stringMatcherStart,
      );
      const interpolatedEnd = source.indexOf("return null;", interpolatedStart);
      expect(stringMatcherStart).toBeGreaterThanOrEqual(0);
      expect(interpolatedStart).toBeGreaterThanOrEqual(0);
      expect(interpolatedEnd).toBeGreaterThan(interpolatedStart);
      expect(source.slice(interpolatedStart, interpolatedEnd)).toContain(
        "true,",
      );
    });

    it("converts plain token nodes without a defensive keyword lookup", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function createFrontendTokenFromParts");
      const end = source.indexOf("switch (typeCode)", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const plainTokenSource = source.slice(start, end);
      expect(plainTokenSource).toContain("typeCode <= GENERIC_TOKEN_KEYWORD");
      expect(plainTokenSource).toContain("type: _type as TokenType");
      expect(plainTokenSource).not.toContain("keywordMap");
    });

    it("dispatches frontend token conversion by generic token kind code", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function createFrontendTokenFromParts");
      const end = source.indexOf("function parseNumber", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const converterSource = source.slice(start, end);
      const dispatch = converterSource.indexOf("switch (typeCode)");
      const commonDispatch = converterSource.indexOf(
        "typeCode <= GENERIC_TOKEN_KEYWORD",
      );
      const nullDispatch = converterSource.indexOf(
        "typeCode === GENERIC_TOKEN_NULLPTR",
      );
      const interpolatedStringCase = converterSource.indexOf(
        "case GENERIC_TOKEN_INTERPOLATED_STRING:",
      );
      const numberCase = converterSource.indexOf("case GENERIC_TOKEN_NUMBER:");
      const stringCase = converterSource.indexOf("case GENERIC_TOKEN_STRING:");

      expect(commonDispatch).toBeGreaterThanOrEqual(0);
      expect(nullDispatch).toBeGreaterThan(commonDispatch);
      expect(dispatch).toBeGreaterThanOrEqual(0);
      expect(dispatch).toBeGreaterThan(nullDispatch);
      expect(interpolatedStringCase).toBeGreaterThan(dispatch);
      expect(numberCase).toBeGreaterThan(interpolatedStringCase);
      expect(stringCase).toBeGreaterThan(numberCase);

      const commonSource = converterSource.slice(commonDispatch, dispatch);
      const numberSource = converterSource.slice(numberCase, stringCase);
      const stringSource = converterSource.slice(stringCase);
      expect(converterSource).not.toContain("type.charCodeAt(0)");
      expect(commonSource).toContain("type: _type as TokenType");
      expect(commonSource).not.toContain("switch (type.length)");
      expect(commonSource).not.toContain('type === "Identifier"');
      expect(converterSource).not.toContain("case GENERIC_TOKEN_PUNCTUATOR:");
      expect(converterSource).not.toContain("case GENERIC_TOKEN_IDENTIFIER:");
      expect(converterSource).not.toContain("case GENERIC_TOKEN_KEYWORD:");
      expect(converterSource).not.toContain("case GENERIC_TOKEN_NULLPTR:");
      expect(numberSource).not.toContain("switch (type.length)");
      expect(numberSource).not.toContain('type === "NumberLiteral"');
      expect(numberSource).not.toContain('type === "NullLiteral"');
      expect(numberSource).not.toContain('type === "NullptrLiteral"');
      expect(stringSource).not.toContain('type === "StringLiteral"');
      expect(stringSource).not.toContain('type === "CharLiteral"');
      expect(stringSource).not.toContain('type === "BoolLiteral"');
    });

    it("keeps unused token range fields out of frontend token conversion", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const converterStart = source.indexOf(
        "function createFrontendTokenFromParts",
      );
      const converterEnd = source.indexOf(
        "function parseNumber",
        converterStart,
      );
      const convertNodeStart = source.indexOf("function convertTokenNodeToToken");
      const convertNodeEnd = source.indexOf(
        "function createFrontendTokenFromParts",
        convertNodeStart,
      );

      expect(converterStart).toBeGreaterThanOrEqual(0);
      expect(converterEnd).toBeGreaterThan(converterStart);
      expect(convertNodeStart).toBeGreaterThanOrEqual(0);
      expect(convertNodeEnd).toBeGreaterThan(convertNodeStart);

      const converterSource = source.slice(converterStart, converterEnd);
      const convertNodeSource = source.slice(convertNodeStart, convertNodeEnd);
      expect(converterSource).not.toContain("_start");
      expect(converterSource).not.toContain("_end");
      expect(convertNodeSource).not.toMatch(/\bstart\b/);
      expect(convertNodeSource).not.toMatch(/\bend\b/);
    });

    it("carries generic token kind codes into frontend token conversion", () => {
      const genericSource = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const lexerSource = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const converterStart = lexerSource.indexOf(
        "function createFrontendTokenFromParts",
      );
      const converterEnd = lexerSource.indexOf(
        "function parseNumber",
        converterStart,
      );

      expect(converterStart).toBeGreaterThanOrEqual(0);
      expect(converterEnd).toBeGreaterThan(converterStart);

      const converterSource = lexerSource.slice(converterStart, converterEnd);
      expect(genericSource).toContain("export type GenericTokenKindCode");
      expect(genericSource).toContain("GENERIC_TOKEN_IDENTIFIER");
      expect(genericSource).toContain("typeCode: GenericTokenKindCode");
      expect(genericSource).toContain("type RangeTokenEmitter<T>");
      expect(genericSource).toContain("if (emitToken.length > 6)");
      expect(genericSource).toMatch(
        /\(emitToken as TokenEmitter<T>\)\(\s*typeCode,\s*type,\s*value,\s*line,\s*column,\s*this\.filePath,/,
      );
      expect(converterSource).toContain("typeCode: GenericTokenKindCode");
      expect(converterSource).toContain("switch (typeCode)");
      expect(converterSource).toContain("typeCode <= GENERIC_TOKEN_KEYWORD");
      expect(converterSource).not.toContain("case GENERIC_TOKEN_IDENTIFIER:");
      expect(converterSource).not.toContain(
        "const typeCode = type.charCodeAt(0);",
      );
    });

    it("carries exact keyword token names through generic lexing without frontend reclassification", () => {
      const genericSource = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const lexerSource = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const classifierStart = genericSource.indexOf(
        "function classifyIdentifierLike",
      );
      const classifierEnd = genericSource.indexOf(
        "function isAsciiDigit",
        classifierStart,
      );
      const converterStart = lexerSource.indexOf(
        "function createFrontendTokenFromParts",
      );
      const converterDispatch = lexerSource.indexOf(
        "switch (typeCode)",
        converterStart,
      );

      expect(classifierStart).toBeGreaterThanOrEqual(0);
      expect(classifierEnd).toBeGreaterThan(classifierStart);
      expect(converterDispatch).toBeGreaterThan(converterStart);

      const classifierSource = genericSource.slice(
        classifierStart,
        classifierEnd,
      );
      const plainTokenSource = lexerSource.slice(
        converterStart,
        converterDispatch,
      );
      expect(genericSource).toContain('keywordKind("Frame")');
      expect(genericSource).toContain('keywordKind("Continue")');
      expect(genericSource).toContain('type: "Nullptr"');
      expect(classifierSource).toContain("FRAME_TOKEN_KIND");
      expect(classifierSource).toContain("CONTINUE_TOKEN_KIND");
      expect(classifierSource).toContain("NULLPTR_TOKEN_KIND");
      expect(plainTokenSource).toContain("type: _type as TokenType");
      expect(plainTokenSource).not.toContain("keywordTokenType(value)");
      expect(
        tokenize("frame continue nullptr")
          .slice(0, 3)
          .map((token) => token.type),
      ).toEqual([TokenType.Frame, TokenType.Continue, TokenType.Nullptr]);
    });

    it("keeps punctuator token conversion on direct character dispatch", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const converterStart = source.indexOf(
        "function createFrontendTokenFromParts",
      );
      const converterEnd = source.indexOf(
        "function parseNumber",
        converterStart,
      );
      const genericSource = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const helperStart = genericSource.indexOf("private matchPunctuator");
      const helperEnd = genericSource.indexOf("private execAt", helperStart);

      expect(converterStart).toBeGreaterThanOrEqual(0);
      expect(converterEnd).toBeGreaterThan(converterStart);
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const converterSource = source.slice(converterStart, converterEnd);
      const helperSource = genericSource.slice(helperStart, helperEnd);
      const plainTokenSource = converterSource.slice(
        0,
        converterSource.indexOf("switch (typeCode)"),
      );
      expect(source).not.toContain("function punctuatorTokenType");
      expect(helperSource).not.toContain('"Punctuator"');
      expect(helperSource).toContain('"LeftParen"');
      expect(helperSource).toContain('"PlusEqual"');
      expect(helperSource).toContain('"EqualEqual"');
      expect(plainTokenSource).toContain("type: _type as TokenType");
      expect(plainTokenSource).not.toContain("punctuatorTokenType");
      expect(converterSource).not.toContain("punctuatorMap[value]");
      expect(helperSource).toContain("switch (firstCode)");
      expect(helperSource).toContain("case 40:");
      expect(helperSource).toContain("case 123:");
    });

    it("converts keyword token nodes through exact generic token names", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function convertTokenNodeToToken");
      const end = source.indexOf("function parseNumber", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const converterSource = source.slice(start, end);
      expect(converterSource).toContain("type: _type as TokenType");
      expect(converterSource).not.toContain("keywordTokenType(value)");
      expect(converterSource).not.toContain("keywordMap[value]");
      expect(converterSource).not.toContain("punctuatorToTokenType(value)");
      expect(source).not.toContain("const keywordMap");
    });

    it("keeps comment-free frontend token construction inline and off helper dispatch", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function createFrontendTokenFromParts");
      const end = source.indexOf("function parseNumber", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const converterSource = source.slice(start, end);
      expect(source).not.toContain("function createPlainFrontendToken");
      expect(converterSource).toContain("type: _type as TokenType,");
      expect(converterSource).toContain("lexeme: value,");
      expect(converterSource).not.toContain("let tokenType: TokenType;");
      expect(converterSource).not.toContain("createPlainFrontendToken(");
      expect(converterSource).not.toContain("new Token(");
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

    it("parses separator-free numeric literals without replace", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function parseNumber");
      const end = source.indexOf("function decodeString", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const parseNumberSource = source.slice(start, end);
      expect(tokenize("123")[0]!.literal).toBe(123);
      expect(tokenize("1_2_3")[0]!.literal).toBe(123);
      expect(parseNumberSource).toContain('raw.indexOf("_") === -1');
      expect(parseNumberSource.indexOf("Number(raw)")).toBeLessThan(
        parseNumberSource.indexOf('raw.replace(/_/g, "")'),
      );
    });

    it("parses small plain decimal integers before generic Number conversion", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function parseNumber");
      const end = source.indexOf("function decodeString", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const parseNumberSource = source.slice(start, end);
      const decimalHelper = parseNumberSource.indexOf(
        "parseSmallPlainDecimalInteger",
      );
      const twoDigitCase = parseNumberSource.indexOf("rawLength === 2");
      const fourDigitCase = parseNumberSource.indexOf("rawLength === 4");
      const genericNumber = parseNumberSource.indexOf("Number(raw)");

      expect(tokenize("12345")[0]!.literal).toBe(12345);
      expect(tokenize("42")[0]!.literal).toBe(42);
      expect(tokenize("999")[0]!.literal).toBe(999);
      expect(tokenize("4999")[0]!.literal).toBe(4999);
      expect(tokenize("3.14")[0]!.literal).toBe(3.14);
      expect(tokenize("0xFF")[0]!.literal).toBe(255);
      expect(tokenize("1_2_3")[0]!.literal).toBe(123);
      expect(parseNumberSource).toContain("const secondCode = raw.charCodeAt(1)");
      expect(parseNumberSource).toContain(
        "return (firstCode - 48) * 10 + secondCode - 48",
      );
      expect(twoDigitCase).toBeGreaterThanOrEqual(0);
      expect(twoDigitCase).toBeLessThan(decimalHelper);
      expect(fourDigitCase).toBeGreaterThanOrEqual(0);
      expect(fourDigitCase).toBeLessThan(decimalHelper);
      expect(decimalHelper).toBeGreaterThanOrEqual(0);
      expect(decimalHelper).toBeLessThan(genericNumber);
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

    it("dispatches backtick strings to the interpolated string matcher", () => {
      const tokens = tokenize("`Hello ${name}!`");

      expect(tokens[0]!.type).toBe(TokenType.InterpolatedStringLiteral);
      expect(tokens[0]!.lexeme).toBe("`Hello ${name}!`");
      expect(tokens[0]!.literal).toBe("`Hello ${name}!`");
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
      const methodEnd = source.indexOf(
        "private matchStringLiteral",
        methodStart,
      );

      expect(methodStart).toBeGreaterThanOrEqual(0);
      expect(methodEnd).toBeGreaterThan(methodStart);

      const methodSource = source.slice(methodStart, methodEnd);
      expect(source).toContain("private readonly hasCommentMarker: boolean");
      expect(source).toContain(
        'hasCommentMarker: boolean = source.includes("#")',
      );
      expect(source).toContain("this.hasCommentMarker = hasCommentMarker;");
      expect(source).toContain("private skipWhitespaceOnly");
      expect(methodSource).toContain("if (!this.hasCommentMarker)");
      expect(methodSource).toContain("this.skipWhitespaceOnly()");
      expect(methodSource.indexOf("skipWhitespaceOnly")).toBeLessThan(
        methodSource.indexOf('startsWith("/#"'),
      );
    });

    it("inlines comment-free whitespace scanning inside the token loop", () => {
      const source = readFileSync(
        join(process.cwd(), "grammar/GenericParser.ts"),
        "utf8",
      );
      const parseStart = source.indexOf("parseWithTokenEmitter");
      const helperStart = source.indexOf(
        "private parseCommentFreeWithTokenEmitter",
        parseStart,
      );
      const helperEnd = source.indexOf(
        "private skipWhitespaceAndComments",
        helperStart,
      );

      expect(parseStart).toBeGreaterThanOrEqual(0);
      expect(helperStart).toBeGreaterThan(parseStart);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const parseSource = source.slice(parseStart, helperStart);
      const helperSource = source.slice(helperStart, helperEnd);
      expect(parseSource).toContain("if (!this.hasCommentMarker)");
      expect(parseSource).toContain(
        "return this.parseCommentFreeWithTokenEmitter(emitToken);",
      );
      expect(helperSource).not.toContain("this.skipWhitespaceOnly();");
      expect(helperSource).not.toContain("this.skipWhitespaceAndComments();");
      expect(helperSource).toContain("const source = this.source;");
      expect(helperSource).toContain("const sourceLength = source.length;");
      expect(helperSource).toContain("let position = this.position;");
      expect(helperSource).toContain("let line = this.line;");
      expect(helperSource).toContain("let column = this.column;");
      expect(helperSource).toContain("const ch = source[position]!");
      expect(helperSource).toContain("this.position = position;");
      expect(helperSource).toContain("this.line = line;");
      expect(helperSource).toContain("this.column = column;");
      expect(helperSource).not.toContain("this.position += 1;");
      expect(helperSource).toContain('if (ch === " " || ch === "\\t" || ch === "\\r")');
      expect(helperSource).toContain('if (ch === "\\n")');
      expect(helperSource).toContain("tokens[tokenCount++] = token;");

      expect(
        tokenize(" \n\tlocal x: int = 1;").map((token) => token.lexeme),
      ).toEqual(["local", "x", ":", "int", "=", "1", ";", ""]);
      expect(
        tokenize("# keep me\nlocal")
          .slice(0, 2)
          .map((token) => token.type),
      ).toEqual([TokenType.Comment, TokenType.Local]);
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
      const parserStartIndex = methodSource.indexOf("new GenericParser");
      const extractionIndex = methodSource.indexOf("extractComments(");

      expect(markerCheckIndex).toBeGreaterThanOrEqual(0);
      expect(parserStartIndex).toBeGreaterThan(markerCheckIndex);
      expect(extractionIndex).toBeGreaterThan(markerCheckIndex);
      expect(methodSource).toMatch(
        /new GenericParser\(\s*grammar,\s*source,\s*filePath,\s*hasCommentMarker,\s*\)/,
      );
      expect(methodSource).toContain("if (hasCommentMarker)");
      expect(methodSource).not.toContain(
        "const comments = extractComments(source, filePath, tokens);\n  mapped.push(...comments);\n\n  // Sort by position\n  mapped.sort",
      );
    });

    it("keeps comment-free lexing on direct frontend token emission", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("export function lexWithGrammar");
      const end = source.indexOf("function extractComments", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const methodSource = source.slice(start, end);
      const commentFreeStart = methodSource.indexOf("if (!hasCommentMarker)");
      const commentFreeEnd = methodSource.indexOf(
        "const { tokens } = genericParser.parse()",
      );

      expect(source).toContain("parseWithTokenEmitter");
      expect(methodSource).toContain("createFrontendTokenFromParts");
      expect(commentFreeStart).toBeGreaterThanOrEqual(0);
      expect(commentFreeEnd).toBeGreaterThan(commentFreeStart);

      const commentFreeBranch = methodSource.slice(
        commentFreeStart,
        commentFreeEnd,
      );
      expect(commentFreeBranch).toContain("parseWithTokenEmitter");
      expect(commentFreeBranch).not.toContain("convertTokenNodeToToken");
    });

    it("keeps comment-bearing grammar token conversion on a preallocated loop", () => {
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

    it("preserves exact comment text and positions around literal markers", () => {
      const tokens = tokenize(
        [
          "# header",
          'local stringValue: string = "# not a comment";',
          "local charValue: char = '#';",
          "local interpolated: string = `# not a comment`;",
          "/# block",
          "body #/",
          "  # tail",
        ].join("\n"),
      );

      expect(
        tokens
          .filter((token) => token.type === TokenType.Comment)
          .map(({ lexeme, line, column }) => ({ lexeme, line, column })),
      ).toEqual([
        { lexeme: "# header", line: 1, column: 1 },
        { lexeme: "/# block\nbody #/", line: 5, column: 1 },
        { lexeme: "# tail", line: 7, column: 3 },
      ]);
    });

    it("extracts comments with one source-index scan", () => {
      const source = readFileSync(
        join(process.cwd(), "compiler/frontend/GrammarLexer.ts"),
        "utf8",
      );
      const start = source.indexOf("function extractComments");
      const end = source.indexOf("function convertTokenNodeToToken", start);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);

      const methodSource = source.slice(start, end);
      expect(methodSource).toContain("const sourceLength = source.length");
      expect(methodSource).toContain("let position = 0");
      expect(methodSource).toContain("source.charCodeAt(position)");
      expect(methodSource).not.toContain('source.split("\\n")');
      expect(methodSource).not.toContain("lineStartIndices");
      expect(methodSource).not.toContain("blockCommentContent +=");
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
