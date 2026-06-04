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

  it("keeps generated identifier token actions off the location path", () => {
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
    const identifierActionName = identifierHelper?.match(
      /return (peg\$f\d+)\(name\);/,
    )?.[1];
    expect(identifierActionName).toBeDefined();
    if (!identifierActionName) {
      throw new Error("Expected generated Identifier action reference");
    }
    const escapedIdentifierActionName = identifierActionName.replace("$", "\\$");
    const identifierTokenAction = generatedSource.match(
      new RegExp(
        `function ${escapedIdentifierActionName}\\(name\\) \\{[\\s\\S]*?\\n  \\}`,
      ),
    )?.[0];

    expect(identifierTokenAction).toContain("return { name };");
    expect(identifierTokenAction).not.toContain("location()");
    expect(identifierTokenAction).not.toContain("start: {");
    expect(identifierTokenAction).not.toContain("end: {");

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

    expect(generatorSource).toContain(
      "optimizeGeneratedStatementStartKeywordScanning",
    );
    expect(generatedSource).toContain(
      "function peg$scanBplStatementStartKeyword()",
    );
    expect(generatedSource).toContain(
      "function peg$isBplIdentifierContinuationCode(code)",
    );
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

    expect(generatedSource).toContain("const peg$emptyTrivia = [];");
    expect(generatedSource).toContain(
      'const peg$hasBplCommentMarker = input.indexOf("#") !== -1;',
    );
    expect(triviaHelper).toContain("while (peg$currPos < input.length)");
    expect(triviaHelper).toContain("pushCommentToken");
    expect(triviaHelper).toContain(
      "currentCode === 32 || currentCode === 9",
    );
    expect(triviaHelper).toContain("if (!peg$hasBplCommentMarker) break;");
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
    const postfixStart = grammarSource.indexOf("\nPostfixTail\n");
    const argumentListStart = grammarSource.indexOf(
      "\nArgumentList\n",
      postfixStart,
    );

    expect(postfixStart).toBeGreaterThanOrEqual(0);
    expect(argumentListStart).toBeGreaterThan(postfixStart);

    const postfixSource = grammarSource.slice(postfixStart, argumentListStart);
    expect(postfixSource).toContain("tail:PostfixTailAfterTrivia");
    expect(postfixSource).toContain("tail.loc = location();");
    expect(postfixSource).toContain("PostfixTailAfterTrivia");
    expect(postfixSource).not.toContain('/ _ "("');
    expect(postfixSource).not.toContain('/ _ "."');
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
