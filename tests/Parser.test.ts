import { describe, expect, it } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { CompilerError } from "../compiler/common/CompilerError";
import type { BlockStmt, FunctionDecl, LiteralExpr } from "../compiler/common/AST";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { generateBplParserSource } from "../tools/generate_peggy_parser";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseReturnedNumberLiteral(source: string): LiteralExpr {
  const program = new Parser(
    `frame main() ret int { return ${source}; }`,
    "number-boundary.bpl",
  ).parse();
  const func = program.statements[0] as FunctionDecl;
  const body = func.body as BlockStmt;
  const returnStatement = body.statements[0]!;

  expect(func.kind).toBe("FunctionDecl");
  expect(body.kind).toBe("Block");
  expect(returnStatement.kind).toBe("Return");
  if (returnStatement.kind !== "Return") {
    throw new Error("Expected return statement");
  }
  const value = returnStatement.value;
  expect(value?.kind).toBe("Literal");
  if (value?.kind !== "Literal") {
    throw new Error("Expected returned literal");
  }
  return value as LiteralExpr;
}

function getGrammarRuleSource(grammarSource: string, ruleName: string): string {
  const match = new RegExp(`(^|\\n)${ruleName}\\n`).exec(grammarSource);
  const start =
    match === null ? -1 : match.index + (match[1]?.length ?? 0);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = grammarSource.indexOf("\n\n", start);
  expect(end).toBeGreaterThan(start);
  return grammarSource.slice(start, end);
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

  it("keeps generated function declaration helpers allocation-free", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
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
    const directFunctionDeclReturn =
      /function functionDecl\([^)]*\) {\s+return { kind: "FunctionDecl",/;

    expect(grammarSource).toMatch(directFunctionDeclReturn);
    expect(generatedSource).toMatch(directFunctionDeclReturn);
    expect(grammarSource).not.toContain(
      'const node = { kind: "FunctionDecl"',
    );
    expect(generatedSource).not.toContain(
      'const node = { kind: "FunctionDecl"',
    );
  });

  it("keeps identifier-heavy primary parsing ahead of literal keyword fallbacks", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
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
    const grammarStart = grammarSource.indexOf("Primary\n  =");
    const grammarEnd = grammarSource.indexOf("\n\nTupleOrGrouped", grammarStart);
    const generatedStart = generatedSource.indexOf(
      "function peg$parsePrimary()",
    );
    const generatedEnd = generatedSource.indexOf(
      "function peg$parseTupleOrGrouped()",
      generatedStart,
    );

    expect(grammarStart).toBeGreaterThanOrEqual(0);
    expect(grammarEnd).toBeGreaterThan(grammarStart);
    expect(generatedStart).toBeGreaterThanOrEqual(0);
    expect(generatedEnd).toBeGreaterThan(generatedStart);

    const primaryGrammar = grammarSource.slice(grammarStart, grammarEnd);
    const primaryParser = generatedSource.slice(generatedStart, generatedEnd);

    expect(primaryGrammar.indexOf("StructLiteral")).toBeLessThan(
      primaryGrammar.indexOf("IdentifierExpr"),
    );
    expect(primaryGrammar.indexOf("IdentifierExpr")).toBeLessThan(
      primaryGrammar.indexOf("BoolLiteral"),
    );
    expect(primaryGrammar.indexOf("IdentifierExpr")).toBeLessThan(
      primaryGrammar.indexOf("NullptrLiteral"),
    );
    expect(primaryParser.indexOf("peg$parseStructLiteral()")).toBeLessThan(
      primaryParser.indexOf("peg$parseIdentifierExpr()"),
    );
    expect(primaryParser.indexOf("peg$parseIdentifierExpr()")).toBeLessThan(
      primaryParser.indexOf("peg$parseBoolLiteral()"),
    );
    expect(primaryParser.indexOf("peg$parseIdentifierExpr()")).toBeLessThan(
      primaryParser.indexOf("peg$parseNullptrLiteral()"),
    );
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

  it("keeps generated binary expression folding off reduce callback actions", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
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
    const expressionStart = grammarSource.indexOf("\nLogicalOr\n");
    const expressionEnd = grammarSource.indexOf("\nUnary\n", expressionStart);

    expect(expressionStart).toBeGreaterThanOrEqual(0);
    expect(expressionEnd).toBeGreaterThan(expressionStart);

    const expressionGrammar = grammarSource.slice(expressionStart, expressionEnd);
    expect(grammarSource).toContain("function foldBinaryTail");
    expect(grammarSource).toContain("function foldTypeCheckTail");
    expect(expressionGrammar).not.toContain("tail.reduce");
    expect(generatedSource).toContain("function foldBinaryTail");
    expect(generatedSource).toContain("function foldTypeCheckTail");
    expect(generatedSource).not.toContain("tail.reduce((acc");
    expect(generatedSource).not.toContain("tail.reduce((expr");
  });

  it("keeps generated binary expression tail parsing off Peggy tuple arrays", () => {
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
    const binaryLevels = [
      ["LogicalOr", "LogicalOrOperator", "LogicalAnd"],
      ["LogicalAnd", "LogicalAndOperator", "BitwiseOr"],
      ["BitwiseOr", "BitwiseOrOperator", "BitwiseXor"],
      ["BitwiseXor", "BitwiseXorOperator", "BitwiseAnd"],
      ["BitwiseAnd", "BitwiseAndOperator", "Equality"],
      ["Equality", "EqualityOperator", "TypeCheck"],
      ["Relational", "RelationalOperator", "Shift"],
      ["Shift", "ShiftOperator", "Additive"],
      ["Additive", "AdditiveOperator", "Multiplicative"],
      ["Multiplicative", "MultiplicativeOperator", "Unary"],
    ];

    expect(generatorSource).toContain(
      "optimizeGeneratedBinaryExpressionTailParsing",
    );

    for (const [levelName, operatorName, nextLevelName] of binaryLevels) {
      const helper = generatedSource.match(
        new RegExp(`function peg\\$parse${levelName}\\(\\)[\\s\\S]*?\\n  }`),
      )?.[0];

      expect(helper).toContain(`let result = peg$parse${nextLevelName}();`);
      expect(helper).toContain(`peg$scanBpl${operatorName}()`);
      expect(helper).toContain(
        "makeTypedOperatorTokenFromPos(operator.type, operator.op, operator.pos)",
      );
      expect(helper).not.toContain("s2 = []");
      expect(helper).not.toContain("s2.push");
      expect(helper).not.toContain("[s4, s5, s6, s7]");
    }

    expect(() =>
      new Parser(
        [
          "frame main() ret int {",
          "  local a: int = 8 + 4 * 2 - 1;",
          "  if ((a << 1) >= 10 && (a & 3) != 0 || (a ^ 1) > 0) {",
          "    return a;",
          "  }",
          "  return 0;",
          "}",
        ].join("\n"),
        "binary-tail-fast-path.bpl",
      ).parse(),
    ).not.toThrow();
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

  it("keeps generated block statement collection off the map/filter allocation path", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
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

    expect(grammarSource).toContain("const statements = []");
    expect(generatedSource).toContain("const statements = []");
    expect(generatedSource).toContain("statements.push(statement)");
    expect(generatedSource).not.toContain(
      "stmts.map(s => s[0]).filter(s => s !== null)",
    );
  });

  it("keeps hot generated parser list actions off tail map/spread allocation", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
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

    for (const ruleName of ["StructLiteralFields", "ParameterList"]) {
      const ruleSource = getGrammarRuleSource(grammarSource, ruleName);
      expect(ruleSource).toContain("collectTailIndex(head, tail, 3)");
      expect(ruleSource).not.toContain("tail.map");
    }

    expect(generatedSource).toContain("function collectTailIndex");
    expect(generatedSource).toContain(
      "return collectTailIndex(head, tail, 3);",
    );
  });

  it("keeps generated operator and merged locations on the direct SourceLocation fast path", () => {
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
    const makeOperatorTokenHelper = generatedSource.match(
      /function makeOperatorToken\(op, loc\) \{[\s\S]*?\n  \}/,
    )?.[0];
    const makeOperatorTokenFromPosHelper = generatedSource.match(
      /function makeOperatorTokenFromPos\(op, startPos, type\) \{[\s\S]*?\n  \}/,
    )?.[0];
    const makeTypedOperatorTokenFromPosHelper = generatedSource.match(
      /function makeTypedOperatorTokenFromPos\(type, op, startPos\) \{[\s\S]*?\n  \}/,
    )?.[0];
    const mergeLocHelper = generatedSource.match(
      /function mergeLoc\(startLoc, endLoc\) \{[\s\S]*?\n  \}/,
    )?.[0];
    const mergeLocToEndPosHelper = generatedSource.match(
      /function mergeLocToEndPos\(startLoc, endPos\) \{[\s\S]*?\n  \}/,
    )?.[0];

    expect(makeOperatorTokenHelper).toContain("line: loc.startLine,");
    expect(makeOperatorTokenHelper).toContain("column: loc.startColumn,");
    expect(makeOperatorTokenHelper).not.toContain("loc &&");
    expect(makeOperatorTokenHelper).not.toContain("let line = 1");
    expect(makeOperatorTokenFromPosHelper).toContain(
      'const resolvedType = type || operatorTypeMap[op] || "Unknown";',
    );
    expect(makeOperatorTokenFromPosHelper).toContain(
      "return makeTypedOperatorTokenFromPos(resolvedType, op, startPos);",
    );
    expect(makeTypedOperatorTokenFromPosHelper).toBeDefined();
    expect(makeTypedOperatorTokenFromPosHelper).toContain(
      "let lineIndex = peg$lastBplLineIndex;",
    );
    expect(makeTypedOperatorTokenFromPosHelper).toContain(
      "lineIndex = peg$findBplLineIndex(startPos);",
    );
    expect(makeTypedOperatorTokenFromPosHelper).toContain(
      "peg$lastBplLinePos = startPos;",
    );
    expect(makeTypedOperatorTokenFromPosHelper).toContain("line: lineIndex + 1,");
    expect(makeTypedOperatorTokenFromPosHelper).toContain(
      "column: startPos - lineStart + 1,",
    );
    expect(makeOperatorTokenFromPosHelper).not.toContain("location()");
    expect(makeTypedOperatorTokenFromPosHelper).toContain("type,");
    expect(makeTypedOperatorTokenFromPosHelper).toContain("lexeme: op,");
    expect(makeTypedOperatorTokenFromPosHelper).toContain("line: lineIndex + 1,");
    expect(makeTypedOperatorTokenFromPosHelper).not.toContain("operatorTypeMap");
    expect(makeTypedOperatorTokenFromPosHelper).not.toContain("resolvedType");
    expect(mergeLocHelper).toContain("startLine: startLoc.startLine,");
    expect(mergeLocHelper).toContain("startColumn: startLoc.startColumn,");
    expect(mergeLocHelper).toContain("endLine: endLoc.endLine,");
    expect(mergeLocHelper).toContain("endColumn: endLoc.endColumn,");
    expect(mergeLocHelper).not.toContain("startLoc &&");
    expect(mergeLocHelper).not.toContain("endLoc &&");
    expect(mergeLocHelper).not.toContain("let startLine = 1");
    expect(mergeLocToEndPosHelper).toContain(
      "const endLineIndex = peg$findBplLineIndex(endPos);",
    );
    expect(mergeLocToEndPosHelper).toContain("startLine: startLoc.startLine,");
    expect(mergeLocToEndPosHelper).toContain(
      "endColumn: endPos - peg$bplLineStarts[endLineIndex] + 1,",
    );
    expect(mergeLocToEndPosHelper).not.toContain("location()");
  });

  it("keeps normalized parser locations off the identity makeLoc path", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
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

    expect(grammarSource).toContain("function makeLoc");
    expect(grammarSource).not.toContain("location: makeLoc(loc)");
    expect(grammarSource).not.toContain("makeLoc(mergeLoc(");
    expect(generatedSource).not.toContain("location: makeLoc(loc)");
    expect(generatedSource).not.toContain("makeLoc(mergeLoc(");
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
    expect(generatedSource).toContain("let peg$lastBplLinePos = 0;");
    expect(generatedSource).toContain("function peg$findBplLineIndex(pos)");
    expect(generatedSource).toContain("if (pos === peg$lastBplLinePos)");
    expect(generatedSource).not.toContain("function peg$isBplPosInLine");
    expect(generatedSource).toContain(
      "if (pos >= peg$bplLineStarts[peg$lastBplLineIndex] &&",
    );
    expect(generatedSource).toContain(
      "peg$lastBplLineIndex + 1 < peg$bplLineStarts.length",
    );
    expect(generatedSource).toContain(
      "pos >= peg$bplLineStarts[peg$lastBplLineIndex + 1]",
    );
    expect(locationHelper).toContain("peg$findBplLineIndex(startPos)");
    expect(locationHelper).toContain(
      "const startLineStart = peg$bplLineStarts[startLineIndex];",
    );
    expect(locationHelper).toContain("const endLineStart =");
    expect(locationHelper).toContain(
      "endPos >= startLineStart",
    );
    expect(locationHelper).toContain(
      "startColumn: startPos - startLineStart + 1,",
    );
    expect(locationHelper).toContain(
      "endColumn: endPos - endLineStart + 1,",
    );
    expect(locationHelper).not.toContain("peg$isBplPosInLine");
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
    expect(identifierHelper).toContain("peg$scanBplIdentTokenEnd()");
    expect(identifierHelper).not.toContain("peg$parseKeywordReserved()");
    expect(identScanner).toContain("input.slice(startPos, endPos)");
    expect(identHelper).toContain("return peg$scanBplIdentToken();");
    expect(identHelper).not.toContain("s3.push");
    const identPartHelper = generatedSource.match(
      /function peg\$isBplIdentPartCode\(code\) \{[\s\S]*?\n  \}/,
    )?.[0];
    expect(identPartHelper).toContain("code >= 65 && code <= 90");
    expect(identPartHelper).toContain("code >= 48 && code <= 57");
    expect(identPartHelper).not.toContain("peg$isBplIdentStartCode(code)");
    expect(keywordHelper).toContain("peg$bplReservedKeywords.has(word)");
    expect(keywordHelper).not.toContain("input.startsWith(peg$c17");
  });

  it("keeps generated identifier parsing off Peggy action dispatch", () => {
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
    const identifierHelper = generatedSource.match(
      /function peg\$parseIdentifier\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(identifierHelper).toContain("return name;");
    expect(identifierHelper).not.toContain("return { name };");
    expect(identifierHelper).not.toMatch(/return peg\$f\d+\(name\);/);
    expect(identifierHelper).not.toContain("peg$savedPos = startPos;");
    expect(identifierHelper).not.toContain("location()");
    expect(identifierHelper).not.toContain("start: {");
    expect(identifierHelper).not.toContain("end: {");

    const program = new Parser(
      "frame main() ret int { local value: int = 1; return value; }",
      "identifier-location.bpl",
    ).parse();
    const func = program.statements[0] as FunctionDecl;
    const body = func.body as BlockStmt;
    const returnStatement = body.statements[1]!;
    expect(returnStatement.kind).toBe("Return");
    if (returnStatement.kind !== "Return") {
      throw new Error("Expected return statement");
    }
    expect(returnStatement.value?.kind).toBe("Identifier");
    expect(returnStatement.value?.location.file).toBe("identifier-location.bpl");
    expect(returnStatement.value?.location.startLine).toBe(1);
    expect(returnStatement.value?.location.startColumn).toBeGreaterThan(0);
  });

  it("rejects reserved words in Identifier without slicing a token name first", () => {
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
    const identifierHelper = generatedSource.match(
      /function peg\$parseIdentifier\(\)[\s\S]*?\n  \}/,
    )?.[0];
    const identTokenHelper = generatedSource.match(
      /function peg\$parseIdentToken\(\)[\s\S]*?\n  \}/,
    )?.[0];
    const identScanner = generatedSource.match(
      /function peg\$scanBplIdentToken\(\)[\s\S]*?\n  \}/,
    )?.[0];
    const identEndStart = generatedSource.indexOf(
      "function peg$scanBplIdentTokenEnd()",
    );
    const identEndEnd = generatedSource.indexOf(
      "function peg$scanBplIdentToken()",
      identEndStart,
    );
    const identEndScanner =
      identEndStart >= 0 && identEndEnd > identEndStart
        ? generatedSource.slice(identEndStart, identEndEnd)
        : undefined;
    const reservedRangeHelper = generatedSource.match(
      /function peg\$isBplReservedKeywordRange\(startPos, endPos\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(identEndScanner).toBeDefined();
    expect(reservedRangeHelper).toBeDefined();
    expect(generatedSource).toContain(
      "function peg$isBplReservedKeywordStartCode(code)",
    );
    expect(generatedSource).toContain("let peg$bplLastIdentStartCode = 0;");
    expect(identEndScanner).toContain("const firstCode =");
    expect(identEndScanner).toContain(
      "peg$bplLastIdentStartCode = firstCode;",
    );
    expect(identEndScanner).toContain("const code = input.charCodeAt(pos)");
    expect(identEndScanner).not.toContain("input.charCodeAt(peg$currPos)");
    expect(identEndScanner).not.toContain("peg$isBplIdentStartCode(firstCode)");
    expect(identEndScanner).not.toContain("peg$isBplIdentPartCode(");
    expect(identifierHelper).toContain(
      "const endPos = peg$scanBplIdentTokenEnd()",
    );
    expect(identifierHelper).toContain(
      "peg$isBplReservedKeywordStartCode(peg$bplLastIdentStartCode) &&",
    );
    expect(identifierHelper).not.toContain("input.charCodeAt(startPos)");
    expect(identifierHelper).toContain(
      "peg$isBplReservedKeywordRange(startPos, endPos)",
    );
    expect(identifierHelper).toContain("input.slice(startPos, endPos)");
    expect(identifierHelper).not.toContain("peg$bplReservedKeywords.has(name)");
    expect(identScanner).toContain(
      "const endPos = peg$scanBplIdentTokenEnd()",
    );
    expect(identScanner).toContain("input.slice(startPos, endPos)");
    expect(identTokenHelper).toContain("return peg$scanBplIdentToken();");

    expect(() => new Parser("local frame: int = 1;", "reserved.bpl").parse())
      .toThrow(CompilerError);
    expect(() => new Parser("local framex: int = 1;", "reserved.bpl").parse())
      .not.toThrow();
  });

  it("keeps generated identifier scanning on a local cursor", () => {
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
    const identEndStart = generatedSource.indexOf(
      "function peg$scanBplIdentTokenEnd()",
    );
    const identEndEnd = generatedSource.indexOf(
      "function peg$scanBplIdentToken()",
      identEndStart,
    );

    expect(identEndStart).toBeGreaterThanOrEqual(0);
    expect(identEndEnd).toBeGreaterThan(identEndStart);

    const identEndScanner = generatedSource.slice(identEndStart, identEndEnd);
    expect(generatorSource).toContain("let pos = peg$currPos;");
    expect(identEndScanner).toContain("let pos = peg$currPos;");
    expect(identEndScanner).toContain("const inputLength = input.length;");
    expect(identEndScanner).toContain("peg$currPos = pos;");
    expect(identEndScanner).toContain("return pos;");
    expect(identEndScanner).not.toContain("peg$currPos++");
    expect(identEndScanner).not.toContain("peg$currPos < input.length");
  });

  it("keeps generated qualified identifier parsing off tail tuple arrays", () => {
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
    const qualifiedHelper = generatedSource.match(
      /function peg\$parseQualifiedIdentifier\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedQualifiedIdentifierScanning",
    );
    expect(qualifiedHelper).toContain("let qualifiedName = head");
    expect(qualifiedHelper).toContain('qualifiedName += "." + tailPart');
    expect(qualifiedHelper).toContain("peg$scanBplIdentToken()");
    expect(qualifiedHelper).not.toContain("s2.push");
    expect(qualifiedHelper).not.toContain(
      'return [head, ...tail.map(t => t[3])].join(".");',
    );

    expect(() =>
      new Parser(
        "frame use(value: Some . Nested . Type) ret int { return 0; }",
        "qualified-type.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("keeps generated postfix-tail parsing gated by starter characters", () => {
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
    const postfixTailHelper = generatedSource.match(
      /function peg\$parsePostfixTail\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedPostfixTailScanning");
    expect(postfixTailHelper).toContain(
      "const nextCode = input.charCodeAt(peg$currPos)",
    );
    expect(postfixTailHelper).toContain("case 60:");
    expect(postfixTailHelper).toContain("case 40:");
    expect(postfixTailHelper).toContain("case 91:");
    expect(postfixTailHelper).toContain("case 46:");
    expect(postfixTailHelper).toContain("case 43:");
    expect(postfixTailHelper).toContain("case 45:");
    expect(postfixTailHelper).toContain("s2 = peg$parsePostfixTailAfterTrivia()");
    expect(postfixTailHelper).toContain("peg$currPos = s0");

    expect(() =>
      new Parser(
        [
          "struct Box { value: int }",
          "frame inc(value: int) ret int { return value + 1; }",
          "frame main() ret int {",
          "  local box: Box = Box { value: 1 };",
          "  local nums: int[2] = [1, 2];",
          "  local total: int = inc (box . value) + nums [1];",
          "  total++;",
          "  return total;",
          "}",
        ].join("\n"),
        "postfix-gate.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("keeps generated number-token parsing on the direct scanner fast path", () => {
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
    const numberHelper = generatedSource.match(
      /function peg\$parseNumberToken\(\)[\s\S]*?\n  }/,
    )?.[0];
    const numberScanner = generatedSource.match(
      /function peg\$scanBplNumberToken\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedNumberScanning");
    expect(generatedSource).toContain("function peg$scanBplNumberToken()");
    expect(generatedSource).toContain("function peg$isBplDigitCode(code)");
    expect(generatedSource).toContain("function peg$isBplHexDigitCode(code)");
    expect(numberHelper).toContain("return peg$scanBplNumberToken();");
    expect(numberHelper).not.toContain("let s0, s1");
    expect(generatedSource).toContain("input.substring(startPos, peg$currPos)");
    expect(numberScanner).toContain("input.charCodeAt(peg$currPos + 1)");
  });

  it("preserves generated number-token trivia boundary behavior", () => {
    expect(() =>
      new Parser("frame main() ret int { return 1_2; }", "number-boundary.bpl")
        .parse(),
    ).toThrow();

    const spacedInteger = parseReturnedNumberLiteral("1 2");
    expect(spacedInteger.raw).toBe("1 2");
    expect(Number.isNaN(spacedInteger.value as number)).toBe(true);

    const decimal = parseReturnedNumberLiteral("1.2");
    expect(decimal.raw).toBe("1.2");
    expect(decimal.value).toBe(1.2);

    const hex = parseReturnedNumberLiteral("0x2f");
    expect(hex.raw).toBe("0x2f");
    expect(hex.value).toBe(47);

    const uppercaseHex = parseReturnedNumberLiteral("0X2f");
    expect(uppercaseHex.raw).toBe("0X2f");
    expect(uppercaseHex.value).toBe(47);

    const binary = parseReturnedNumberLiteral("0b1010");
    expect(binary.raw).toBe("0b1010");
    expect(binary.value).toBe(10);

    const octal = parseReturnedNumberLiteral("0o17");
    expect(octal.raw).toBe("0o17");
    expect(octal.value).toBe(15);

    const largeDecimal = parseReturnedNumberLiteral("9007199254740993");
    expect(largeDecimal.value).toBe(Number("9007199254740993"));

    expect(() =>
      new Parser("frame main() ret int { return 0x; }", "number-boundary.bpl")
        .parse(),
    ).toThrow();
    expect(() =>
      new Parser("frame main() ret int { return 0b1021; }", "number-boundary.bpl")
        .parse(),
    ).toThrow();
  });

  it("keeps generated number literal conversion on the direct parser fast path", () => {
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
    const parseNumberHelper = generatedSource.match(
      /function parseNumber\(raw\) \{[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatedSource).toContain("function parseBplDecimalNumber(raw)");
    expect(generatedSource).toContain("function parseBplPrefixedNumber");
    expect(parseNumberHelper).toContain("if (raw.length === 1)");
    expect(parseNumberHelper).toContain("return firstCode - 48");
    expect(parseNumberHelper).not.toContain("raw.replace");
    expect(parseNumberHelper).not.toContain("/^0x/i.test");
    expect(parseNumberHelper).not.toContain("/^0b/i.test");
    expect(parseNumberHelper).not.toContain("/^0o/i.test");
  });

  it("keeps generated statement-start keyword lookahead on the direct scanner fast path", () => {
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
    const statementStartHelper = generatedSource.match(
      /function peg\$parseStatementStartKeyword\(\)[\s\S]*?\n  }/,
    )?.[0];
    const statementStartScanner = generatedSource.match(
      /function peg\$scanBplStatementStartKeyword\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedStatementStartKeywordScanning",
    );
    expect(generatedSource).toContain(
      "function peg$scanBplStatementStartKeyword()",
    );
    expect(generatedSource).toContain(
      "function peg$isBplIdentifierContinuationCode(code)",
    );
    expect(
      generatedSource.includes(
        "function peg$matchBplStatementStartKeyword(keyword)",
      ),
    ).toBe(false);
    expect(statementStartScanner).toContain(
      "const startPos = peg$currPos;",
    );
    expect(statementStartScanner).toContain(
      "input.charCodeAt(startPos + 1)",
    );
    expect(
      statementStartScanner?.includes(
        "peg$matchBplStatementStartKeyword(",
      ),
    ).toBe(false);
    expect(statementStartScanner?.includes("input.startsWith")).toBe(false);
    expect(statementStartHelper).toContain(
      "return peg$scanBplStatementStartKeyword();",
    );
    expect(statementStartHelper).not.toContain("peg$parseIdBoundary");
    expect(statementStartHelper).not.toContain("input.startsWith(peg$c17");
  });

  it("keeps generated assignment-operator parsing on the direct scanner fast path", () => {
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
    const assignmentOperatorHelper = generatedSource.match(
      /function peg\$parseAssignmentOperator\(\)[\s\S]*?\n  }/,
    )?.[0];
    const assignmentOperatorScanner = generatedSource.match(
      /function peg\$scanBplAssignmentOperator\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedAssignmentOperatorScanning",
    );
    expect(generatedSource).toContain(
      "function peg$scanBplAssignmentOperator()",
    );
    expect(generatedSource).toContain(
      "function peg$failBplAssignmentOperatorExpectation()",
    );
    expect(assignmentOperatorHelper).toContain(
      "return peg$scanBplAssignmentOperator();",
    );
    expect(assignmentOperatorHelper).not.toContain("let s0, s1");
    expect(assignmentOperatorHelper).not.toContain("input.startsWith(peg$c38");
    expect(assignmentOperatorScanner).toContain("input.charCodeAt(startPos)");
    expect(assignmentOperatorScanner).toContain(
      'return { op: "+=", type: "PlusEqual", pos: startPos };',
    );
    expect(assignmentOperatorScanner).not.toContain("peg$savedPos = startPos");
  });

  it("keeps generated expression-operator parsing on direct scanner fast paths", () => {
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
    const operatorNames = [
      "LogicalOrOperator",
      "LogicalAndOperator",
      "BitwiseOrOperator",
      "BitwiseXorOperator",
      "BitwiseAndOperator",
      "EqualityOperator",
      "RelationalOperator",
      "ShiftOperator",
      "AdditiveOperator",
      "MultiplicativeOperator",
      "UnaryOperator",
    ];

    expect(generatorSource).toContain(
      "optimizeGeneratedExpressionOperatorScanning",
    );
    for (const operatorName of operatorNames) {
      const helper = generatedSource.match(
        new RegExp(`function peg\\$parse${operatorName}\\(\\)[\\s\\S]*?\\n  }`),
      )?.[0];
      const scanner = generatedSource.match(
        new RegExp(`function peg\\$scanBpl${operatorName}\\(\\)[\\s\\S]*?\\n  }`),
      )?.[0];

      expect(generatedSource).toContain(
        `function peg$scanBpl${operatorName}()`,
      );
      expect(generatedSource).toContain(
        `function peg$failBpl${operatorName}Expectation()`,
      );
      expect(helper).toContain(`return peg$scanBpl${operatorName}();`);
      expect(helper).not.toContain("let s0, s1");
      expect(helper).not.toContain("input.startsWith");
      expect(scanner).toContain("input.charCodeAt(startPos)");
      expect(scanner).toContain("pos: startPos");
      expect(scanner).toContain("type:");
      expect(scanner).not.toContain("peg$savedPos = startPos");
    }
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
    const whitespaceHelper = generatedSource.match(
      /function peg\$parseWhitespaceOnly\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatedSource).toContain("const peg$emptyTrivia = [];");
    expect(generatedSource).toContain(
      'const peg$hasBplCommentMarker = options.bplHasCommentMarker ?? input.indexOf("#") !== -1;',
    );
    expect(generatedSource).toContain("function peg$parseWhitespaceOnly()");
    expect(whitespaceHelper).toContain("while (peg$currPos < input.length)");
    expect(
      whitespaceHelper?.match(/while \(peg\$currPos < input\.length\)/g)
        ?.length ?? 0,
    ).toBe(1);
    expect(whitespaceHelper).toContain(
      "currentCode !== 32 && currentCode !== 9",
    );
    expect(whitespaceHelper).not.toContain("pushCommentToken");
    expect(triviaHelper).toContain("while (peg$currPos < input.length)");
    expect(triviaHelper).toContain("pushCommentToken");
    expect(triviaHelper).toContain(
      "currentCode === 32 || currentCode === 9",
    );
    expect(triviaHelper).toContain(
      "if (!peg$hasBplCommentMarker) return peg$parseWhitespaceOnly();",
    );
    expect(triviaHelper).not.toContain("if (!peg$hasBplCommentMarker) break;");
    expect(triviaHelper).toContain("return peg$emptyTrivia;");
    expect(triviaHelper).not.toContain("return [];");
    expect(triviaHelper).not.toContain("peg$parseWhitespace()");
    expect(triviaHelper).not.toContain("peg$parseComment()");
    expect(triviaHelper).not.toContain("peg$isBplWhitespaceCode");
    expect(generatedSource).not.toContain("function peg$isBplWhitespaceCode");
  });

  it("keeps postfix tail trivia factored once for parser throughput", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const postfixStart = grammarSource.indexOf("\nPostfix\n");
    const postfixTailStart = grammarSource.indexOf("\nPostfixTail\n");
    const argumentListStart = grammarSource.indexOf(
      "\nArgumentList\n",
      postfixStart,
    );

    expect(postfixStart).toBeGreaterThanOrEqual(0);
    expect(postfixTailStart).toBeGreaterThan(postfixStart);
    expect(argumentListStart).toBeGreaterThan(postfixStart);

    const postfixSectionSource = grammarSource.slice(
      postfixStart,
      argumentListStart,
    );
    const postfixTailSource = grammarSource.slice(
      postfixTailStart,
      argumentListStart,
    );
    expect(postfixTailSource).toContain("tail:PostfixTailAfterTrivia");
    expect(postfixTailSource).toContain("tail.startPos = peg$savedPos;");
    expect(postfixTailSource).toContain("tail.endPos = offset();");
    expect(postfixTailSource).not.toContain("tail.loc = location();");
    expect(postfixSectionSource).toContain(
      "mergeLocToEndPos(expr.location, post.endPos)",
    );
    expect(postfixSectionSource).not.toContain(
      "mergeLoc(expr.location, post.loc)",
    );
    expect(postfixTailSource).toContain("PostfixTailAfterTrivia");
    expect(postfixTailSource).not.toContain('/ _ "("');
    expect(postfixTailSource).not.toContain('/ _ "."');
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
    expect(
      failHelper!.indexOf("if (!peg$collectExpected) { return; }"),
    ).toBeLessThan(failHelper!.indexOf("peg$currPos < peg$maxFailPos"));
    expect(failHelper).toContain("peg$maxFailExpected.push(expected);");
  });

  it("dispatches declaration statements before the expression fallback", () => {
    const grammarSource = readFileSync(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const statementStart = grammarSource.indexOf("\nStatement\n");
    const statementEnd = grammarSource.indexOf("\n\nErrorRecovery\n");

    expect(statementStart).toBeGreaterThanOrEqual(0);
    expect(statementEnd).toBeGreaterThan(statementStart);

    const statementSource = grammarSource.slice(statementStart, statementEnd);
    const expressionIndex = statementSource.indexOf("/ ExpressionStatement");

    expect(statementSource.indexOf("/ FunctionDeclaration")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ StructDeclaration")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ EnumDeclaration")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ SpecDeclaration")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ TypeAlias")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ ImportStatement")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ ExportStatement")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ ExternDeclaration")).toBeLessThan(
      expressionIndex,
    );
    expect(statementSource.indexOf("/ AsmBlock")).toBeLessThan(expressionIndex);
  });

  it("keeps comment-free parser passes off token comment filtering", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "frontend", "Parser.ts"),
      "utf8",
    );
    const parseStart = source.indexOf("public parse(");
    const attachStart = source.indexOf("private attachComments", parseStart);

    expect(parseStart).toBeGreaterThanOrEqual(0);
    expect(attachStart).toBeGreaterThan(parseStart);

    const parseSource = source.slice(parseStart, attachStart);
    const markerIndex = parseSource.indexOf('this.source.includes("#")');
    const filterIndex = parseSource.indexOf("this.tokens.filter");

    expect(markerIndex).toBeGreaterThanOrEqual(0);
    expect(filterIndex).toBeGreaterThan(markerIndex);
    expect(parseSource).toContain("const hasCommentMarker");
    expect(parseSource).toContain("hasCommentMarker");
    expect(parseSource).toContain("? this.tokens.filter");
    expect(parseSource).toContain("else if (hasCommentMarker)");
    expect(parseSource).toContain("comments = ast.comments || []");
    expect(parseSource).toContain(
      "if (hasCommentMarker) {\n      this.attachComments(ast, comments);\n    }",
    );
  });

  it("threads precomputed comment-marker state into the generated parser", () => {
    const parserSource = readFileSync(
      join(process.cwd(), "compiler", "frontend", "Parser.ts"),
      "utf8",
    );
    const wrapperSource = readFileSync(
      join(process.cwd(), "compiler", "frontend", "PeggyParser.ts"),
      "utf8",
    );
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

    expect(parserSource).toMatch(
      /parseWithPeggy\(\s*this\.source,\s*this\.filePath,\s*\{\s*hasCommentMarker,\s*\}\s*\)/,
    );
    expect(wrapperSource).toContain(
      "options: { hasCommentMarker?: boolean } = {}",
    );
    expect(wrapperSource).toContain(
      "bplHasCommentMarker: options.hasCommentMarker,",
    );
    expect(generatorSource).toContain(
      'options.bplHasCommentMarker ?? input.indexOf("#") !== -1',
    );
    expect(generatedSource).toContain(
      'options.bplHasCommentMarker ?? input.indexOf("#") !== -1',
    );
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
