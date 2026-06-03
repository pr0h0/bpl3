import { describe, expect, it } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { generateBplParserSource } from "../tools/generate_peggy_parser";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("Parser", () => {
  it("should parse a simple function declaration", () => {
    const source = "frame main() { return; }";
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const program = parser.parse();

    expect(program.statements.length).toBe(1);
    const funcDecl = program.statements[0]!;
    expect(funcDecl.kind).toBe("FunctionDecl");
    if (funcDecl.kind === "FunctionDecl") {
      expect(funcDecl.name).toBe("main");
      expect(funcDecl.isFrame).toBe(true);
    }
  });

  it("should parse a struct declaration", () => {
    const source = "struct Point { x: int, y: int, }";
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const program = parser.parse();

    expect(program.statements.length).toBe(1);
    const structDecl = program.statements[0]!;
    expect(structDecl.kind).toBe("StructDecl");
    if (structDecl.kind === "StructDecl") {
      expect(structDecl.name).toBe("Point");
      expect(structDecl.members.length).toBe(2);
    }
  });

  it("should parse variable declarations", () => {
    const source = "local x: int = 10; global y: string;";
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const program = parser.parse();

    expect(program.statements.length).toBe(2);
    const var1 = program.statements[0]!;
    expect(var1.kind).toBe("VariableDecl");
    if (var1.kind === "VariableDecl") {
      expect(var1.isGlobal).toBe(false);
      // expect(var1.name).toBe("x"); // VariableDecl structure is complex (destructuring)
    }

    const var2 = program.statements[1]!;
    expect(var2.kind).toBe("VariableDecl");
    if (var2.kind === "VariableDecl") {
      expect(var2.isGlobal).toBe(true);
    }
  });

  it("keeps Peggy packrat caching disabled for large translation-unit throughput", () => {
    const generatorSource = readFileSync(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );

    expect(generatorSource).toContain("cache: false");
    expect(generatorSource).not.toContain("cache: true");
  });

  it("keeps generated parser action locations flat for large translation-unit throughput", () => {
    const generatorSource = readFileSync(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readFileSync(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );

    expect(generatorSource).toContain("optimizeGeneratedParserSource");
    expect(generatedSource).toContain("function peg$computeBplLocation");
    expect(generatedSource).toContain(
      "return peg$computeBplLocation(peg$savedPos, peg$currPos);",
    );
    expect(generatedSource).not.toContain(
      "return peg$computeLocation(peg$savedPos, peg$currPos);",
    );
  });

  it("keeps generated parser location helper on the BPL SourceLocation fast path", () => {
    const generatedSource = readFileSync(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );

    expect(generatedSource).toContain("const parserFilePath =");
    const locationHelper = generatedSource.match(
      /function peg\$computeBplLocation[\s\S]*?\n  }/,
    )?.[0];
    expect(locationHelper).toContain("file: parserFilePath,");
    expect(locationHelper).not.toContain("options.filePath");
    expect(generatedSource).toContain(
      [
        "function makeLoc(loc) {",
        "    return loc;",
        "  }",
      ].join("\n"),
    );
    expect(generatedSource).not.toContain("startLine: 0");
    expect(generatedSource).not.toContain("loc && loc.start && loc.end");
  });

  it("keeps BPL AST locations on the generated line-start fast path", () => {
    const generatorSource = readFileSync(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readFileSync(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const locationHelper = generatedSource.match(
      /function peg\$computeBplLocation[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedBplLocationLines");
    expect(generatedSource).toContain("const peg$bplLineStarts = [0];");
    expect(generatedSource).toContain("let peg$lastBplLineIndex = 0;");
    expect(generatedSource).toContain("function peg$findBplLineIndex(pos)");
    expect(generatedSource).toContain("function peg$isBplPosInLine(pos, lineIndex)");
    expect(locationHelper).toContain("peg$findBplLineIndex(startPos)");
    expect(locationHelper).toContain("peg$isBplPosInLine(endPos, startLineIndex)");
    expect(locationHelper).not.toContain("peg$computePosDetails");
  });

  it("keeps generated parser literal matches allocation-free", () => {
    const generatedSource = readFileSync(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );

    expect(generatedSource).toContain("input.startsWith(peg$c");
    expect(generatedSource).not.toContain("input.substr(peg$currPos,");
  });

  it("keeps generated identifier and reserved-keyword parsing on the direct scanner fast path", () => {
    const generatorSource = readFileSync(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readFileSync(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const identHelper = generatedSource.match(
      /function peg\$parseIdentToken\(\)[\s\S]*?\n  }/,
    )?.[0];
    const identScanner = generatedSource.match(
      /function peg\$scanBplIdentToken\(\)[\s\S]*?\n  }/,
    )?.[0];
    const identifierHelper = generatedSource.match(
      /function peg\$parseIdentifier\(\)[\s\S]*?\n  }/,
    )?.[0];
    const keywordHelper = generatedSource.match(
      /function peg\$parseKeywordReserved\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedIdentifierScanning");
    expect(generatedSource).toContain("function peg$scanBplIdentToken()");
    expect(generatedSource).toContain("function peg$isBplIdentStartCode(code)");
    expect(generatedSource).toContain("function peg$isBplIdentPartCode(code)");
    expect(generatedSource).toContain("const peg$bplReservedKeywords = new Set");
    expect(identifierHelper).toContain("peg$scanBplIdentToken()");
    expect(identifierHelper).not.toContain("peg$parseKeywordReserved()");
    expect(identScanner).toContain("input.substring(startPos, peg$currPos)");
    expect(identHelper).toContain("return peg$scanBplIdentToken();");
    expect(identHelper).not.toContain("s3.push");
    expect(keywordHelper).toContain("peg$bplReservedKeywords.has(word)");
    expect(keywordHelper).not.toContain("input.startsWith(peg$c17");
  });

  it("preserves keyword boundary behavior for identifiers", () => {
    for (const source of [
      "local framex: int = 1;",
      "local defer: int = 1;",
      "local void: int = 1;",
    ]) {
      expect(() => new Parser(source, "keyword-boundary.bpl").parse()).not.toThrow();
    }

    for (const source of [
      "local Self: int = 1;",
      "local frame: int = 1;",
    ]) {
      expect(() => new Parser(source, "keyword-boundary.bpl").parse()).toThrow(
        CompilerError,
      );
    }
  });

  it("keeps generated parser trivia skipping on the manual fast path", () => {
    const generatedSource = readFileSync(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const triviaHelper = generatedSource.match(
      /function peg\$parse_\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatedSource).toContain("const peg$emptyTrivia = [];");
    expect(triviaHelper).toContain("while (peg$currPos < input.length)");
    expect(triviaHelper).toContain("pushCommentToken");
    expect(triviaHelper).toContain("return peg$emptyTrivia;");
    expect(triviaHelper).not.toContain("return [];");
    expect(triviaHelper).not.toContain("peg$parseWhitespace()");
    expect(triviaHelper).not.toContain("peg$parseComment()");
  });

  it("keeps valid parses off the detailed Peggy failure collection path", () => {
    const generatorSource = readFileSync(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const wrapperSource = readFileSync(
      join(process.cwd(), "compiler", "frontend", "PeggyParser.ts"),
      "utf8",
    );
    const generatedSource = readFileSync(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const failHelper = generatedSource.match(
      /function peg\$fail\(expected\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedFailureTracking");
    expect(wrapperSource).toContain("bplCollectExpected,");
    expect(wrapperSource).toContain("return parseOnce(false);");
    expect(wrapperSource).toContain("return parseOnce(true);");
    expect(generatedSource).toContain(
      "const peg$collectExpected = options.bplCollectExpected !== false;",
    );
    expect(failHelper).toContain("if (!peg$collectExpected) { return; }");
    expect(failHelper).toContain("peg$maxFailExpected.push(expected);");
  });

  it("preserves syntax diagnostics through the fast parser retry", () => {
    const parser = new Parser(
      "frame main() { local value: int = ; }",
      "syntax-retry.bpl",
    );

    try {
      parser.parse();
      throw new Error("Expected parser to reject invalid syntax");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CompilerError);
      const compilerError = error as CompilerError;
      expect(compilerError.message).toContain("Unexpected syntax");
      expect(compilerError.location.file).toBe("syntax-retry.bpl");
      expect(compilerError.location.startLine).toBe(1);
      expect(compilerError.location.startColumn).toBeGreaterThan(0);
    }
  });

  it("keeps the checked-in generated Peggy parser in sync with grammar/bpl.peggy", () => {
    const grammarPath = join(process.cwd(), "grammar", "bpl.peggy");
    const generatedPath = join(
      process.cwd(),
      "compiler",
      "frontend",
      "generated",
      "BplParser.js",
    );

    if (!existsSync(generatedPath)) {
      throw new Error(`Generated Peggy parser is missing: ${generatedPath}`);
    }

    const grammarSource = readFileSync(grammarPath, "utf8");
    const expectedSource = generateBplParserSource(grammarSource);
    const actualSource = readFileSync(generatedPath, "utf8");

    expect(sha256(actualSource)).toBe(sha256(expectedSource));
  });
});
