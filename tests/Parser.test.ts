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

function readTextFile(path: string, encoding: BufferEncoding = "utf8"): string {
  return readFileSync(path, encoding).replace(/\r\n?/g, "\n");
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

  it("defers the implicit Error import for sources that cannot reference Error", () => {
    const program = new Parser(
      "frame main() ret int { return 0; }",
      "test.bpl",
    ).parse(true);

    expect(program.statements).toHaveLength(1);
    expect(program.statements[0]!.kind).toBe("FunctionDecl");
  });

  it("keeps the implicit Error import when a source references Error", () => {
    const program = new Parser(
      "frame make(message: string) ret Error { return Error.new(message); }",
      "test.bpl",
    ).parse(true);

    expect(program.statements[0]).toMatchObject({
      kind: "Import",
      source: "std/errors.bpl",
      isImplicit: true,
    });
  });

  it("keeps generated function declaration helpers allocation-free", () => {
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );

    expect(generatorSource).toContain("cache: false");
    expect(generatorSource).not.toContain("cache: true");
  });

  it("keeps generated binary expression folding off reduce callback actions", () => {
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
      expect(helper).toContain(
        "const tailCode = input.charCodeAt(tailStartPos);",
      );
      expect(helper).toContain("!peg$collectExpected &&");
      if (levelName === "Relational") {
        expect(helper).not.toContain("!peg$hasBplCommentMarker &&");
        expect(helper).toContain("tailCode !== 35");
      } else {
        expect(helper).toContain("!peg$hasBplCommentMarker &&");
      }
      expect(helper).toContain("tailCode !== 32 &&");
      expect(helper).toContain(`peg$scanBpl${operatorName}()`);
      if (levelName === "Additive" || levelName === "Relational") {
        expect(helper).toContain("        operator,");
      } else {
        expect(helper).toContain(
          "makeTypedOperatorTokenFromPos(operator.type, operator.op, operator.pos)",
        );
      }
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

  it("guards generated relational tails by actual comment starters", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const helper = generatedSource.match(
      /function peg\$parseRelational\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedRelationalActualTailGuard",
    );
    expect(helper).not.toContain("!peg$hasBplCommentMarker &&");
    expect(helper).toContain("tailCode !== 35");
    expect(helper).toContain("tailCode !== 47 ||");
    expect(helper).toContain(
      "input.charCodeAt(tailStartPos + 1) !== 35",
    );

    expect(() =>
      new Parser(
        "frame main() ret int { return 1 /# gap #/ < 2 ? 1 : 0; }",
        "relational-actual-comment-tail.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "frame main() ret int { return 1 < ; }",
        "relational-actual-tail-diagnostic.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated bitwise-or operator scans after trivia", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const helper = generatedSource.match(
      /function peg\$parseBitwiseOr\(\)[\s\S]*?\n  }/,
    )?.[0];
    const trivia = helper?.indexOf("peg$parse_();") ?? -1;
    const postTriviaGuard =
      helper?.indexOf("input.charCodeAt(peg$currPos) !== 124", trivia) ?? -1;
    const scanner =
      helper?.indexOf("peg$scanBplBitwiseOrOperator()", trivia) ?? -1;

    expect(generatorSource).toContain(
      "optimizeGeneratedBitwiseOrPostTriviaGuard",
    );
    expect(trivia).toBeGreaterThanOrEqual(0);
    expect(postTriviaGuard).toBeGreaterThan(trivia);
    expect(scanner).toBeGreaterThan(postTriviaGuard);
    expect(helper).toContain("if (!peg$collectExpected &&");
    expect(helper).toContain("peg$currPos = tailStartPos;");
    expect(helper).toContain("return result;");

    expect(() =>
      new Parser(
        "frame main() ret int { return (1 | 2) || (3 == 3) ? 1 : 0; }",
        "bitwise-or-post-trivia-guard.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "frame main() ret int { return 1 | ; }",
        "bitwise-or-post-trivia-diagnostic.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated logical-and operator scans after trivia", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const helper = generatedSource.match(
      /function peg\$parseLogicalAnd\(\)[\s\S]*?\n  }/,
    )?.[0];
    const trivia = helper?.indexOf("peg$parse_();") ?? -1;
    const postTriviaGuard =
      helper?.indexOf("const operatorCode = input.charCodeAt(peg$currPos);") ??
      -1;
    const scanner =
      helper?.indexOf("peg$scanBplLogicalAndOperator()", trivia) ?? -1;

    expect(generatorSource).toContain(
      "optimizeGeneratedLogicalAndPostTriviaGuard",
    );
    expect(trivia).toBeGreaterThanOrEqual(0);
    expect(postTriviaGuard).toBeGreaterThan(trivia);
    expect(scanner).toBeGreaterThan(postTriviaGuard);
    expect(helper).toContain("operatorCode !== 38 ||");
    expect(helper).toContain(
      "input.charCodeAt(peg$currPos + 1) !== 38",
    );
    expect(helper).toContain("!peg$collectExpected &&");
    expect(helper).toContain("peg$currPos = tailStartPos;");
    expect(helper).toContain("return result;");

    expect(() =>
      new Parser(
        "frame main() ret int { return ((3 & 1) == 1 && 2 == 2) ? 1 : 0; }",
        "logical-and-post-trivia-guard.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "frame main() ret int { return 1 && ; }",
        "logical-and-post-trivia-diagnostic.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated multiplicative operator scans after trivia", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const helper = generatedSource.match(
      /function peg\$parseMultiplicative\(\)[\s\S]*?\n  }/,
    )?.[0];
    const trivia = helper?.indexOf("peg$parse_();") ?? -1;
    const postTriviaGuard =
      helper?.indexOf("const operatorCode = input.charCodeAt(peg$currPos);") ??
      -1;
    const scanner =
      helper?.indexOf("peg$scanBplMultiplicativeOperator()", trivia) ?? -1;

    expect(generatorSource).toContain(
      "optimizeGeneratedMultiplicativePostTriviaGuard",
    );
    expect(trivia).toBeGreaterThanOrEqual(0);
    expect(postTriviaGuard).toBeGreaterThan(trivia);
    expect(scanner).toBeGreaterThan(postTriviaGuard);
    expect(helper).toContain("operatorCode !== 42");
    expect(helper).toContain("operatorCode !== 47");
    expect(helper).toContain("operatorCode !== 37");
    expect(helper).toContain("        !peg$collectExpected &&");
    expect(helper).toContain("peg$currPos = tailStartPos;");
    expect(helper).toContain("return result;");

    expect(() =>
      new Parser(
        "frame main() ret int { return 8 /# gap #/ / 2 * 3 % 5; }",
        "multiplicative-post-trivia-guard.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "frame main() ret int { return 1 * ; }",
        "multiplicative-post-trivia-diagnostic.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("keeps generated type-check lookahead on the direct scanner fast path", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const helper = generatedSource.match(
      /function peg\$parseTypeCheck\(\)[\s\S]*?\n  }/,
    )?.[0];
    const scanner = generatedSource.match(
      /function peg\$scanBplTypeCheckOperator\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedTypeCheckTailParsing");
    expect(helper).toContain("peg$scanBplTypeCheckOperator()");
    expect(helper).toContain("operator === 1 ? isNode");
    expect(helper).not.toContain("peg$parseK_is()");
    expect(helper).not.toContain("peg$parseK_as()");
    expect(helper).not.toContain("s2 = []");
    expect(helper).not.toContain("s2.push");
    expect(scanner).toContain("switch (input.charCodeAt(startPos))");
    expect(scanner).toContain("peg$isBplIdentifierContinuationCode");
    expect(scanner).toContain("return 1;");
    expect(scanner).toContain("return 2;");

    expect(() =>
      new Parser(
        [
          "frame main() ret int {",
          "  local value: int = 1;",
          "  local same: bool = value is int;",
          "  local casted: int = value as int;",
          "  return casted;",
          "}",
        ].join("\n"),
        "type-check-lookahead-fast-path.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("keeps generated parser action locations flat for large translation-unit throughput", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    const generatedSource = readTextFile(
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
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

  it("keeps generated top-level statement collection off map/filter allocation", () => {
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const programRuleSource = getGrammarRuleSource(grammarSource, "Program");
    const programAction = generatedSource.match(
      /function peg\$f\d+\(stmts\) \{[\s\S]*?return \{ kind: "Program", statements, location: loc \};\n  \}/,
    )?.[0];

    expect(programRuleSource).toContain("const statements = []");
    expect(programRuleSource).toContain("statements.push(statement)");
    expect(programRuleSource).not.toContain("stmts.map");
    expect(programRuleSource).not.toContain(".filter(Boolean)");
    expect(programAction).toContain("const statements = []");
    expect(programAction).toContain("statements.push(statement)");
    expect(programAction).not.toContain("stmts.map");
    expect(programAction).not.toContain(".filter(Boolean)");
  });

  it("keeps hot generated parser list actions off tail map/spread allocation", () => {
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );

    for (const ruleName of [
      "ArgumentList",
      "StructLiteralFields",
      "ParameterList",
    ]) {
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
    const generatedSource = readTextFile(
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
      "let endLineIndex = startLoc.endLine - 1;",
    );
    expect(mergeLocToEndPosHelper).toContain(
      "const nextLineStart = peg$bplLineStarts[endLineIndex + 1];",
    );
    expect(mergeLocToEndPosHelper).toContain(
      "endLineIndex = peg$findBplLineIndex(endPos);",
    );
    expect(mergeLocToEndPosHelper).not.toContain(
      "const endLineIndex = peg$findBplLineIndex(endPos);",
    );
    expect(mergeLocToEndPosHelper).toContain("startLine: startLoc.startLine,");
    expect(mergeLocToEndPosHelper).toContain(
      "endColumn: endPos - peg$bplLineStarts[endLineIndex] + 1,",
    );
    expect(mergeLocToEndPosHelper).not.toContain("location()");

    const multilinePostfix = new Parser(
      [
        "struct Box { value: int }",
        "frame main(box: Box) ret int {",
        "  return box",
        "    .value;",
        "}",
      ].join("\n"),
      "multiline-postfix-location.bpl",
    ).parse();
    const multilineFunction = multilinePostfix.statements[1] as FunctionDecl;
    const multilineBody = multilineFunction.body as BlockStmt;
    const multilineReturn = multilineBody.statements[0]!;
    expect(multilineReturn.kind).toBe("Return");
    if (multilineReturn.kind !== "Return") {
      throw new Error("Expected multiline return statement");
    }
    expect(multilineReturn.value?.location.endLine).toBe(4);
  });

  it("keeps normalized parser locations off the identity makeLoc path", () => {
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    expect(generatedSource).toContain("const peg$bplInputLength = input.length;");
    expect(generatedSource).toContain("let peg$lastBplLineIndex = 0;");
    expect(generatedSource).toContain("let peg$lastBplLinePos = 0;");
    expect(generatedSource).toContain("function peg$findBplLineIndex(pos)");
    expect(generatedSource).not.toContain("if (pos === peg$lastBplLinePos)");
    expect(generatedSource).toContain(
      "const backwardLineLimit = peg$lastBplLineIndex > 8",
    );
    expect(generatedSource).toContain(
      "peg$lastBplLineIndex > backwardLineLimit",
    );
    expect(generatedSource).toContain(
      'let peg$bplLinePos = input.indexOf("\\n");',
    );
    expect(generatedSource).toContain(
      'peg$bplLinePos = input.indexOf("\\n", peg$bplLinePos + 1);',
    );
    expect(generatedSource).not.toContain(
      "input.charCodeAt(peg$bplLinePos) === 10",
    );
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
      "Successful source ranges satisfy endPos >= startPos >= startLineStart.",
    );
    expect(locationHelper).not.toContain("endPos >= startLineStart");
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
    const generatedSource = readTextFile(
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
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    expect(identifierHelper).toContain("let endPos = startPos + 1;");
    expect(identifierHelper).toContain("while (endPos < peg$bplInputLength)");
    expect(identifierHelper).not.toContain("peg$scanBplIdentTokenEnd(firstCode)");
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
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

    expect(generatorSource).toContain("peg$bplLastIdentifierStart");
    expect(generatedSource).toContain("let peg$bplLastIdentifierStart = -1;");
    expect(generatedSource).toContain("let peg$bplLastIdentifierEnd = -1;");
    expect(generatedSource).toContain('let peg$bplLastIdentifierValue = "";');
    expect(identifierHelper).toContain(
      "if (startPos === peg$bplLastIdentifierStart)",
    );
    expect(identifierHelper).toContain(
      "peg$currPos = peg$bplLastIdentifierEnd;",
    );
    expect(identifierHelper).toContain(
      "if (peg$collectExpected && peg$silentFails === 0)",
    );
    expect(identifierHelper).toContain("const value = input.slice(startPos, endPos);");
    expect(identifierHelper).toContain("peg$bplLastIdentifierStart = startPos;");
    expect(identifierHelper).toContain("peg$bplLastIdentifierEnd = endPos;");
    expect(identifierHelper).toContain("peg$bplLastIdentifierValue = value;");
    expect(identifierHelper).toContain("return value;");
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

  it("keeps generated identifier expressions off Peggy action dispatch", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const identifierExprHelper = generatedSource.match(
      /function peg\$parseIdentifierExpr\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedIdentifierExpressionAction",
    );
    expect(identifierExprHelper).toContain("const startPos = peg$currPos;");
    expect(identifierExprHelper).toContain(
      "const name = peg$parseIdentifier();",
    );
    expect(identifierExprHelper).toContain(
      "return identifier(name, peg$computeBplLocation(startPos, peg$currPos));",
    );
    expect(identifierExprHelper).not.toContain("peg$savedPos");
    expect(identifierExprHelper).not.toMatch(/peg\$f\d+\(/);

    const program = new Parser(
      "frame main() ret int {\n  return value;\n}",
      "identifier-expression-location.bpl",
    ).parse();
    const func = program.statements[0] as FunctionDecl;
    const body = func.body as BlockStmt;
    const returnStatement = body.statements[0]!;
    expect(returnStatement.kind).toBe("Return");
    if (returnStatement.kind !== "Return") {
      throw new Error("Expected return statement");
    }
    expect(returnStatement.value?.kind).toBe("Identifier");
    expect(returnStatement.value?.location).toEqual({
      file: "identifier-expression-location.bpl",
      startLine: 2,
      startColumn: 10,
      endLine: 2,
      endColumn: 15,
    });
  });

  it("caches repeated identifier failures only on the fast parser pass", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

    expect(generatorSource).toContain("peg$bplLastIdentifierFailure");
    expect(generatedSource).toContain("let peg$bplLastIdentifierFailure = -1;");
    expect(identifierHelper).toContain(
      "if (startPos === peg$bplLastIdentifierFailure && !peg$collectExpected)",
    );
    expect(identifierHelper).toContain(
      "peg$bplLastIdentifierFailure = startPos;",
    );
    expect(() =>
      new Parser(
        "frame main() ret int { return @; }",
        "identifier-failure-cache-diagnostic.bpl",
      ).parse(),
    ).toThrow("Unexpected syntax: 'return @'");
  });

  it("rejects reserved words in Identifier without slicing a token name first", () => {
    const generatedSource = readTextFile(
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
      "function peg$scanBplIdentTokenEnd(firstCode)",
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
    expect(generatedSource).not.toContain("peg$bplLastIdentStartCode");
    expect(identifierHelper).toContain(
      "const firstCode = input.charCodeAt(startPos);",
    );
    expect(identEndScanner).not.toContain("const firstCode =");
    expect(identEndScanner).toContain("const code = input.charCodeAt(pos)");
    expect(identEndScanner).not.toContain("input.charCodeAt(peg$currPos)");
    expect(identEndScanner).not.toContain("peg$isBplIdentStartCode(firstCode)");
    expect(identEndScanner).not.toContain("peg$isBplIdentPartCode(");
    expect(identifierHelper).toContain("let endPos = startPos + 1;");
    expect(identifierHelper).toContain(
      "const code = input.charCodeAt(endPos);",
    );
    expect(identifierHelper).not.toContain(
      "peg$scanBplIdentTokenEnd(firstCode)",
    );
    expect(identifierHelper).toContain(
      "peg$isBplReservedKeywordStartCode(firstCode) &&",
    );
    expect(identifierHelper).toContain(
      "peg$isBplReservedKeywordRange(startPos, endPos)",
    );
    expect(identifierHelper).toContain("input.slice(startPos, endPos)");
    expect(identifierHelper).not.toContain("peg$bplReservedKeywords.has(name)");
    expect(identScanner).toContain(
      "const endPos = peg$scanBplIdentTokenEnd(firstCode)",
    );
    expect(identScanner).toContain("input.slice(startPos, endPos)");
    expect(identTokenHelper).toContain("return peg$scanBplIdentToken();");

    expect(() => new Parser("local frame: int = 1;", "reserved.bpl").parse())
      .toThrow(CompilerError);
    expect(() => new Parser("local framex: int = 1;", "reserved.bpl").parse())
      .not.toThrow();
  });

  it("keeps the identifier fast path independent from the shared token scanner", () => {
    const generatedSource = readTextFile(
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
    const identScanner = generatedSource.match(
      /function peg\$scanBplIdentToken\(\)[\s\S]*?\n  \}/,
    )?.[0];
    const identEndStart = generatedSource.indexOf(
      "function peg$scanBplIdentTokenEnd(firstCode)",
    );
    const identEndEnd = generatedSource.indexOf(
      "function peg$scanBplIdentToken()",
      identEndStart,
    );
    const identEndScanner =
      identEndStart >= 0 && identEndEnd > identEndStart
        ? generatedSource.slice(identEndStart, identEndEnd)
        : undefined;

    expect(identifierHelper).toBeDefined();
    expect(identScanner).toBeDefined();
    expect(identEndScanner).toBeDefined();
    expect(generatedSource).not.toContain("peg$bplLastIdentStartCode");
    expect(identifierHelper).toContain(
      "const firstCode = input.charCodeAt(startPos);",
    );
    expect(identifierHelper).toContain("let endPos = startPos + 1;");
    expect(identifierHelper).toContain("while (endPos < peg$bplInputLength)");
    expect(identifierHelper).not.toContain(
      "peg$scanBplIdentTokenEnd(firstCode)",
    );
    expect(identifierHelper).toContain(
      "peg$isBplReservedKeywordStartCode(firstCode) &&",
    );
    expect(identEndScanner).toContain(
      "function peg$scanBplIdentTokenEnd(firstCode)",
    );
    expect(identEndScanner).not.toContain("const firstCode =");
    expect(identScanner).toContain(
      "const firstCode = input.charCodeAt(startPos);",
    );
    expect(identScanner).toContain(
      "const endPos = peg$scanBplIdentTokenEnd(firstCode);",
    );
  });

  it("keeps generated identifier scanner fail recording behind expected collection", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
      "function peg$scanBplIdentTokenEnd(firstCode)",
    );
    const identEndEnd = generatedSource.indexOf(
      "function peg$scanBplIdentToken()",
      identEndStart,
    );

    expect(identEndStart).toBeGreaterThanOrEqual(0);
    expect(identEndEnd).toBeGreaterThan(identEndStart);

    const identEndScanner = generatedSource.slice(identEndStart, identEndEnd);
    const successPosition = identEndScanner.indexOf("peg$currPos = pos;");
    const guardedFail = identEndScanner.indexOf(
      "if (peg$collectExpected && peg$silentFails === 0)",
      successPosition,
    );
    const successFail = identEndScanner.indexOf("peg$fail(peg$e79);");

    expect(generatorSource).toContain("peg$collectExpected && peg$silentFails");
    expect(identEndScanner).toContain("while (pos < peg$bplInputLength)");
    expect(identEndScanner).not.toContain("const inputLength = input.length;");
    expect(successPosition).toBeGreaterThanOrEqual(0);
    expect(guardedFail).toBeGreaterThan(successPosition);
    expect(successFail).toBeGreaterThan(guardedFail);
  });

  it("keeps generated identifier scanning on a local cursor", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
      "function peg$scanBplIdentTokenEnd(firstCode)",
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
    expect(generatedSource).toContain("const peg$bplInputLength = input.length;");
    expect(identEndScanner).toContain("while (pos < peg$bplInputLength)");
    expect(identEndScanner).not.toContain("const inputLength = input.length;");
    expect(identEndScanner).toContain("peg$currPos = pos;");
    expect(identEndScanner).toContain("return pos;");
    expect(identEndScanner).not.toContain("peg$currPos++");
    expect(identEndScanner).not.toContain("peg$currPos < input.length");
  });

  it("keeps generated qualified identifier parsing off tail tuple arrays", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
    expect(postfixTailHelper).toContain("s2.startPos = s0");
    expect(postfixTailHelper).toContain("s2.endPos = peg$currPos");
    expect(postfixTailHelper).toContain("return s2");
    expect(postfixTailHelper).not.toMatch(/peg\$f\d+\(s2\)/);
    expect(postfixTailHelper).toContain("peg$currPos = s0");
    expect(generatedSource).not.toContain(
      "tail.startPos = peg$savedPos;",
    );

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

  it("keeps generated postfix parsing allocation-free for zero or one member tail", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const postfixHelper = generatedSource.match(
      /function peg\$parsePostfix\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedPostfixParsing");
    expect(postfixHelper).toContain(
      "const firstPostfix = peg$parsePostfixTail()",
    );
    expect(postfixHelper).toContain(
      "if (firstPostfix === peg$FAILED) { return primary; }",
    );
    expect(postfixHelper).toContain(
      [
        "if (secondPostfix === peg$FAILED) {",
        "      peg$savedPos = startPos;",
        '      if (firstPostfix.type === "member") {',
        "        return member(",
        "          primary,",
        "          firstPostfix.property,",
        "          mergeLocToEndPos(primary.location, firstPostfix.endPos),",
        "        );",
        "      }",
      ].join("\n"),
    );
    expect(postfixHelper).toContain(
      [
        '      if (firstPostfix.type === "call") {',
        "        return call(",
        "          primary,",
        "          firstPostfix.args,",
        "          mergeLocToEndPos(primary.location, firstPostfix.endPos),",
        "        );",
        "      }",
      ].join("\n"),
    );
    expect(postfixHelper).toMatch(
      /return peg\$f\d+\(primary, \[firstPostfix\]\);/,
    );
    expect(postfixHelper).toContain(
      "const postfixes = [firstPostfix, secondPostfix];",
    );
    expect(postfixHelper).not.toContain("s2 = []");

    expect(() =>
      new Parser(
        [
          "struct Box { value: int }",
          "frame id(value: int) ret int { return value; }",
          "frame main() ret int {",
          "  local box: Box = Box { value: 2 };",
          "  local x: int = id(box.value);",
          "  return x;",
          "}",
        ].join("\n"),
        "postfix-fast-path.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("folds direct-dot member postfixes before allocating tail objects", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const postfixHelper = generatedSource.match(
      /function peg\$parsePostfix\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatorSource).toContain("directMemberStartPos");
    expect(postfixHelper).toContain(
      "!peg$collectExpected &&\n      !peg$hasBplCommentMarker",
    );
    expect(postfixHelper).toContain(
      "input.charCodeAt(directMemberStartPos) === 46",
    );
    expect(postfixHelper).toContain(
      "const directMemberProperty = peg$parseIdentifier();",
    );
    expect(postfixHelper).toContain(
      "let directMemberLookaheadPos = directMemberEndPos;",
    );
    expect(postfixHelper).toContain("const directMember = member(");
    expect(postfixHelper).toContain(
      "const firstPostfix = peg$parsePostfixTail();",
    );
    expect(postfixHelper.indexOf("const directMember = member(")).toBeLessThan(
      postfixHelper.indexOf("const firstPostfix = peg$parsePostfixTail();"),
    );

    expect(() =>
      new Parser(
        [
          "enum Shape { Circle { radius: int } }",
          "struct Box { child: Box, value: int }",
          "frame main() ret int {",
          "  local box: Box;",
          "  local direct: int = box.value;",
          "  local spaced: int = box . value;",
          "  local chained: int = box.child.value;",
          "  local tupleMember: int = (1, 2).0;",
          "  local variant: Shape = Shape.Circle { radius: 1 };",
          "  return direct;",
          "}",
        ].join("\n"),
        "direct-member-postfix.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("caches repeated successful struct literal parses only on the side-effect-free fast pass", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const structLiteralHelper = generatedSource.match(
      /function peg\$parseStructLiteral\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedStructLiteralSuccessCaching",
    );
    expect(structLiteralHelper).toContain(
      "peg$currPos === peg$bplLastStructLiteralStart",
    );
    expect(structLiteralHelper).toContain("!peg$collectExpected");
    expect(structLiteralHelper).toContain("!peg$hasBplCommentMarker");
    expect(structLiteralHelper).toContain(
      "peg$currPos = peg$bplLastStructLiteralEnd",
    );
    expect(structLiteralHelper).toContain(
      "return peg$bplLastStructLiteralValue",
    );
    expect(generatedSource).toContain(
      "peg$bplLastStructLiteralStart = startPos;",
    );
    expect(generatedSource).toContain(
      "peg$bplLastStructLiteralEnd = peg$currPos;",
    );
    expect(generatedSource).toContain("peg$bplLastStructLiteralValue = s0;");

    const program = new Parser(
      [
        "struct Pair { first: int, second: int }",
        "frame main() ret int {",
        "  local first: Pair = Pair { first: 1, second: 2 };",
        "  local second: Pair = Pair { first: 1, second: 2 };",
        "  return first.first + second.first;",
        "}",
      ].join("\n"),
      "struct-literal-cache.bpl",
    ).parse();
    const main = program.statements[1]!;
    expect(main.kind).toBe("FunctionDecl");
    if (main.kind !== "FunctionDecl") {
      throw new Error("Expected main function");
    }
    const [first, second] = main.body.statements;
    expect(first?.kind).toBe("VariableDecl");
    expect(second?.kind).toBe("VariableDecl");
    if (first?.kind !== "VariableDecl" || second?.kind !== "VariableDecl") {
      throw new Error("Expected variable declarations");
    }
    expect(first.initializer?.kind).toBe("StructLiteral");
    expect(second.initializer?.kind).toBe("StructLiteral");
    expect(first.initializer).not.toBe(second.initializer);
    expect(first.initializer?.location).not.toBe(second.initializer?.location);
  });

  it("parses ternary conditions once for comment-bearing sources", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const ternaryHelper = generatedSource.match(
      /function peg\$parseTernary\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedTernaryParsing");
    expect(ternaryHelper).toContain("const condition = peg$parseLogicalOr()");
    expect(ternaryHelper?.match(/peg\$parseLogicalOr\(\)/g)).toHaveLength(1);
    expect(ternaryHelper).toContain("const conditionEndPos = peg$currPos");
    expect(ternaryHelper).toContain(
      "const conditionCommentCount = comments?.length ?? 0",
    );
    expect(ternaryHelper).toContain(
      "if (comments && comments.length !== conditionCommentCount)",
    );
    expect(ternaryHelper).toContain("peg$currPos = conditionEndPos");
    expect(ternaryHelper).toContain("peg$fail(peg$e");
    expect(ternaryHelper).not.toContain("if (peg$hasBplCommentMarker)");
    expect(generatedSource).not.toContain(
      "function peg$parseTernaryWithCommentMarkers()",
    );
    expect(ternaryHelper).not.toContain("if (s0 === peg$FAILED)");

    const program = new Parser(
      [
        "frame main() ret int {",
        "  local plain: int = 1 + 2; # plain value",
        "  local nested: int = true ? false ? 3 : 4 : plain;",
        "  return nested;",
        "}",
      ].join("\n"),
      "ternary-single-pass.bpl",
    ).parse();

    expect(program.comments).toHaveLength(1);
    expect(program.comments?.[0]?.lexeme).toBe("# plain value");
  });

  it("keeps generated number-token parsing on the direct scanner fast path", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

  it("keeps generated string-literal parsing on the direct fast scanner", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const stringHelper = generatedSource.match(
      /function peg\$parseStringLiteral\(\)[\s\S]*?\n  }/,
    )?.[0];
    const stringScanner = generatedSource.match(
      /function peg\$scanBplStringLiteral\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedStringLiteralScanning");
    expect(generatedSource).toContain("function peg$scanBplStringLiteral()");
    expect(generatedSource).toContain(
      "function peg$parseStringLiteralDetailed()",
    );
    expect(stringHelper).toContain("const raw = peg$scanBplStringLiteral()");
    expect(stringScanner).toContain("if (code === 92)");
    expect(stringScanner).toContain("if (code === 10 || code === 13)");

    const program = new Parser(
      'frame main() ret string { return "line\\n\\"quote\\""; }',
      "string-scanner.bpl",
    ).parse();
    const func = program.statements[0] as FunctionDecl;
    const body = func.body as BlockStmt;
    const returnStatement = body.statements[0]!;

    expect(returnStatement.kind).toBe("Return");
    if (returnStatement.kind !== "Return") {
      throw new Error("Expected return statement");
    }
    expect(returnStatement.value).toMatchObject({
      kind: "Literal",
      type: "string",
      raw: '"line\\n\\"quote\\""',
      value: 'line\n"quote"',
    });
  });

  it("scans plain interpolated-string runs directly", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const scanner = generatedSource.match(
      /function peg\$scanBplPlainInterpolatedStringChars\(\)[\s\S]*?\n  }/,
    )?.[0];
    const program = new Parser(
      "frame main(value: int) ret string { return `plain ${value} tail`; }",
      "interpolated-runs.bpl",
    ).parse();
    const func = program.statements[0] as FunctionDecl;
    const body = func.body as BlockStmt;
    const returnStatement = body.statements[0]!;

    expect(generatorSource).toContain(
      "optimizeGeneratedInterpolatedStringRunScanning",
    );
    expect(generatedSource).toContain(
      "function peg$parseInterpolatedStringCharsDetailed()",
    );
    expect(scanner).toContain("input.substring(startPos, pos)");
    expect(scanner).toContain(
      "code === 92 || code === 34 || code === 10 || code === 13",
    );

    expect(returnStatement.kind).toBe("Return");
    if (
      returnStatement.kind !== "Return" ||
      returnStatement.value?.kind !== "InterpolatedString"
    ) {
      throw new Error("Expected interpolated string return");
    }
    expect(returnStatement.value.parts).toMatchObject([
      { kind: "Literal", type: "string", value: "plain " },
      { kind: "Identifier", name: "value" },
      { kind: "Literal", type: "string", value: " tail" },
    ]);
  });

  it("decodes ordinary string spans without per-character appends", () => {
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const decodeStringHelper = grammarSource.match(
      /  function decodeString\(raw\) \{[\s\S]*?\n  }/,
    )?.[0];

    expect(decodeStringHelper).toContain(
      'const firstEscape = inner.indexOf("\\\\");',
    );
    expect(decodeStringHelper).toContain(
      "if (firstEscape === -1) return inner;",
    );
    expect(decodeStringHelper).toContain(
      "let result = inner.slice(0, firstEscape);",
    );
    expect(decodeStringHelper).toContain("let i = firstEscape;");
    expect(decodeStringHelper).toContain(
      'const nextEscape = inner.indexOf("\\\\", i);',
    );
    expect(decodeStringHelper).toContain(
      "result += inner.slice(i, nextEscape);",
    );
    expect(decodeStringHelper).not.toContain("result += inner[i]");

    const program = new Parser(
      'frame plain() ret string { return "plain text"; }\n' +
        'frame escaped() ret string { return "a\\nb\\x41\\u0042\\q"; }',
      "string-runs.bpl",
    ).parse();
    const values = program.statements.map((statement) => {
      const func = statement as FunctionDecl;
      const body = func.body as BlockStmt;
      const returnStatement = body.statements[0]!;
      if (returnStatement.kind !== "Return") {
        throw new Error("Expected return statement");
      }
      return returnStatement.value?.kind === "Literal"
        ? returnStatement.value.value
        : undefined;
    });

    expect(values).toEqual(["plain text", "a\nbAB\\q"]);
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
    const generatedSource = readTextFile(
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
    const smallDecimalCall = parseNumberHelper?.indexOf(
      "parseSmallBplDecimalNumber",
    );
    const twoDigitCase = parseNumberHelper?.indexOf("if (rawLength === 2 &&");
    const fourDigitCase = parseNumberHelper?.indexOf("if (rawLength === 4 &&");
    const decimalCall = parseNumberHelper?.indexOf("parseBplDecimalNumber(raw)");

    expect(parseReturnedNumberLiteral("12345").value).toBe(12345);
    expect(parseReturnedNumberLiteral("42").value).toBe(42);
    expect(parseReturnedNumberLiteral("999").value).toBe(999);
    expect(parseReturnedNumberLiteral("4999").value).toBe(4999);
    expect(generatedSource).toContain("function parseBplDecimalNumber(raw)");
    expect(generatedSource).toContain("function parseSmallBplDecimalNumber(");
    expect(generatedSource).toContain("function parseBplPrefixedNumber");
    expect(parseNumberHelper).toContain("const rawLength = raw.length");
    expect(parseNumberHelper).toContain("if (rawLength === 1)");
    expect(parseNumberHelper).toContain("return firstCode - 48");
    expect(parseNumberHelper).toContain("const secondCode = raw.charCodeAt(1)");
    expect(parseNumberHelper).toContain(
      "return (firstCode - 48) * 10 + secondCode - 48",
    );
    expect(twoDigitCase).toBeGreaterThanOrEqual(0);
    expect(twoDigitCase).toBeLessThan(smallDecimalCall ?? -1);
    expect(fourDigitCase).toBeGreaterThanOrEqual(0);
    expect(fourDigitCase).toBeLessThan(smallDecimalCall ?? -1);
    expect(smallDecimalCall).toBeGreaterThanOrEqual(0);
    expect(smallDecimalCall).toBeLessThan(decimalCall ?? -1);
    expect(parseNumberHelper).not.toContain("raw.replace");
    expect(parseNumberHelper).not.toContain("/^0x/i.test");
    expect(parseNumberHelper).not.toContain("/^0b/i.test");
    expect(parseNumberHelper).not.toContain("/^0o/i.test");
  });

  it("keeps generated statement-start keyword lookahead on the direct scanner fast path", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

  it("dispatches keyword-led statements before the generated fallback chain", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const statementHelper = generatedSource.match(
      /function peg\$parseStatement\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedStatementDispatch");
    expect(statementHelper).toContain("if (!peg$collectExpected)");
    expect(statementHelper).not.toContain("peg$hasBplCommentMarker");
    expect(statementHelper).toContain(
      "const statementKind = peg$scanBplStatementStartKeyword();",
    );
    expect(statementHelper).toContain(
      "if (startPos >= peg$bplInputLength || input.charCodeAt(startPos) === 125)",
    );
    expect(statementHelper).toContain("return peg$FAILED;");
    expect(statementHelper).toContain("parser = peg$parseReturnStatement;");
    expect(statementHelper).toContain("parser = peg$parseFunctionDeclaration;");
    expect(statementHelper).toContain("peg$currPos = startPos;");
    expect(statementHelper).toContain("return peg$parseStatementFallback();");
    expect(generatedSource).toContain("function peg$parseStatementFallback()");
  });

  it("dispatches comment-free non-keyword statements before fallback", () => {
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const statementHelper = generatedSource.match(
      /function peg\$parseStatement\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(statementHelper).toContain(
      "statementKind === peg$FAILED && input.charCodeAt(startPos) !== 123",
    );
    expect(statementHelper).toContain("peg$parseExpressionStatement");
    expect(statementHelper).toContain("peg$currPos = startPos;");
    expect(statementHelper).toContain("return peg$parseStatementFallback();");
  });

  it("guards generated function-declaration fallback failures by exact starters", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const functionHelper = generatedSource.match(
      /function peg\$parseFunctionDeclaration\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedFunctionDeclarationFailureGuard",
    );
    expect(functionHelper).toContain("if (!peg$collectExpected)");
    expect(functionHelper).toContain(
      "const startCode = input.charCodeAt(startPos);",
    );
    expect(functionHelper).toContain("startCode !== 64");
    expect(functionHelper).toContain("input.charCodeAt(startPos + 1) !== 91");
    expect(functionHelper).toContain("startCode !== 102");
    expect(functionHelper).toContain(
      "peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 5))",
    );
    expect(functionHelper).toContain("return peg$FAILED;");

    for (const functionSource of [
      "frame plain() {}",
      "@[inline]\nframe attributed() {}",
      "struct Resource { @[inline] frame method(this: *Resource) {} }",
    ]) {
      expect(
        new Parser(functionSource, "function-declaration-guard.bpl").parse()
          .statements,
      ).toHaveLength(1);
    }

    expect(() =>
      new Parser(
        "@[inline]\nframe malformed(",
        "malformed-function-declaration-guard.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated import-statement fallback failures by exact keyword", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const importHelper = generatedSource.match(
      /function peg\$parseImportStatement\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedImportStatementFailureGuard",
    );
    expect(importHelper).toContain("if (!peg$collectExpected)");
    expect(importHelper).toContain("input.charCodeAt(startPos) !== 105");
    expect(importHelper).toContain(
      "peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 6))",
    );
    expect(importHelper).toContain("return peg$FAILED;");

    for (const importSource of [
      'import [Thing] from "thing.bpl";',
      'import * as thing from "thing.bpl";',
      'import "thing.bpl";',
    ]) {
      const program = new Parser(importSource, "import-guard.bpl").parse();
      expect(program.statements[0]?.kind).toBe("Import");
    }

    expect(() =>
      new Parser(
        'import [Thing] "thing.bpl";',
        "malformed-import-guard.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated switch-statement fallback failures by exact keyword", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const switchHelper = generatedSource.match(
      /function peg\$parseSwitchStatement\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedSwitchStatementFailureGuard",
    );
    expect(switchHelper).toContain("if (!peg$collectExpected)");
    expect(switchHelper).toContain("input.charCodeAt(startPos) !== 115");
    expect(switchHelper).toContain(
      "peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 6))",
    );
    expect(switchHelper).toContain("return peg$FAILED;");

    for (const switchSource of [
      "switch (value) { default: return value; }",
      "switch value { default: return value; }",
    ]) {
      const program = new Parser(
        `frame main() ret int { local value: int = 1; ${switchSource} }`,
        "switch-guard.bpl",
      ).parse();
      const func = program.statements[0] as FunctionDecl;
      const body = func.body as BlockStmt;

      expect(body.statements[1]?.kind).toBe("Switch");
    }
  });

  it("guards generated spec-declaration fallback failures by exact keyword", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const specHelper = generatedSource.match(
      /function peg\$parseSpecDeclaration\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedSpecDeclarationFailureGuard",
    );
    expect(specHelper).toContain("if (!peg$collectExpected)");
    expect(specHelper).toContain("input.charCodeAt(startPos) !== 115");
    expect(specHelper).toContain(
      "peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 4))",
    );
    expect(specHelper).toContain("return peg$FAILED;");

    expect(() =>
      new Parser(
        [
          "spec Parent { frame read(); }",
          "spec Child<T>: Parent { frame get(value: T) ret T; }",
        ].join("\n"),
        "spec-declaration-guard.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "spec Broken { frame run(",
        "malformed-spec-declaration-guard.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated enum-declaration fallback failures by exact keyword", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const enumHelper = generatedSource.match(
      /function peg\$parseEnumDeclaration\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedEnumDeclarationFailureGuard",
    );
    expect(enumHelper).toContain("if (!peg$collectExpected)");
    expect(enumHelper).toContain("input.charCodeAt(startPos) !== 101");
    expect(enumHelper).toContain(
      "peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 4))",
    );
    expect(enumHelper).toContain("return peg$FAILED;");

    expect(() =>
      new Parser(
        [
          "enum Empty {}",
          "enum Result<T> { Ok(T), Error(string) }",
        ].join("\n"),
        "enum-declaration-guard.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "enum Broken { Value(",
        "malformed-enum-declaration-guard.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated try-statement fallback failures by exact keyword", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const tryHelper = generatedSource.match(
      /function peg\$parseTryStatement\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedTryStatementFailureGuard");
    expect(tryHelper).toContain("if (!peg$collectExpected)");
    expect(tryHelper).toContain("input.charCodeAt(startPos) !== 116");
    expect(tryHelper).toContain(
      "peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 3))",
    );
    expect(tryHelper).toContain("return peg$FAILED;");

    expect(() =>
      new Parser(
        "frame main() { try { throw 1; } catch (error: int) {} }",
        "try-statement-guard.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "frame main() { try { throw 1;",
        "malformed-try-statement-guard.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards generated boolean-literal failures by first character", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const boolHelper = generatedSource.match(
      /function peg\$parseBoolLiteral\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedBoolLiteralFailureGuard",
    );
    expect(boolHelper).toContain("if (!peg$collectExpected)");
    expect(boolHelper).toContain("startCode !== 116 && startCode !== 102");
    expect(boolHelper).toContain("return peg$FAILED;");

    const program = new Parser(
      "frame main() { local yes: bool = true; local no: bool = false; }",
      "boolean-literal-guard.bpl",
    ).parse();
    const func = program.statements[0] as FunctionDecl;
    const body = func.body as BlockStmt;

    expect(body.statements).toHaveLength(2);
  });

  it("caches generated variable-declaration scope keyword retries", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const scopeScanner = generatedSource.match(
      /function peg\$scanBplVariableScopeKeyword\(\)[\s\S]*?\n  }/,
    )?.[0];
    const globalHelper = generatedSource.match(
      /function peg\$parseK_global\(\)[\s\S]*?\n  }/,
    )?.[0];
    const localHelper = generatedSource.match(
      /function peg\$parseK_local\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedVariableScopeKeywordScanning",
    );
    expect(generatedSource).toContain("let peg$bplLastVariableScopeStart = -1");
    expect(scopeScanner).toContain(
      "if (startPos === peg$bplLastVariableScopeStart)",
    );
    expect(scopeScanner).toContain(
      "peg$isBplIdentifierContinuationCode",
    );
    expect(globalHelper).toContain("peg$scanBplVariableScopeKeyword()");
    expect(globalHelper).toContain("scope === 1");
    expect(localHelper).toContain("peg$scanBplVariableScopeKeyword()");
    expect(localHelper).toContain("scope === 2");
    expect(globalHelper).not.toContain("input.startsWith");
    expect(localHelper).not.toContain("input.startsWith");
    expect(globalHelper).not.toContain("peg$parseIdBoundary");
    expect(localHelper).not.toContain("peg$parseIdBoundary");

    expect(() =>
      new Parser(
        [
          "global answer: int = 42;",
          "frame main() ret int {",
          "  local value: int = answer;",
          "  return value;",
          "}",
        ].join("\n"),
        "variable-scope-cache.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "frame main() ret int { locality value: int = 1; return value; }",
        "variable-scope-boundary.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("parses variable-declaration scope once before declaration alternatives", () => {
    const grammarSource = readTextFile(
      join(process.cwd(), "grammar", "bpl.peggy"),
      "utf8",
    );
    const ruleStart = grammarSource.indexOf("\nVariableDeclaration\n");
    const ruleEnd = grammarSource.indexOf("\nDestructTargetList\n", ruleStart);

    expect(ruleStart).toBeGreaterThanOrEqual(0);
    expect(ruleEnd).toBeGreaterThan(ruleStart);

    const rule = grammarSource.slice(ruleStart, ruleEnd);
    expect(rule.match(/\bK_global\b/g)).toHaveLength(1);
    expect(rule.match(/\bK_local\b/g)).toHaveLength(1);
    expect(rule).toContain("scope:(K_global { return true; } / K_local { return false; })");
  });

  it("keeps generated identifier boundary checks off regex dispatch", () => {
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const boundaryHelper = generatedSource.match(
      /function peg\$parseIdBoundary\(\)[\s\S]*?\n  \}/,
    )?.[0];

    expect(boundaryHelper).toContain(
      "const code = input.charCodeAt(peg$currPos);",
    );
    expect(boundaryHelper).toContain("code >= 48 && code <= 57");
    expect(boundaryHelper).toContain("return undefined;");
    expect(boundaryHelper).not.toContain("peg$r12.test");
    expect(boundaryHelper).not.toContain("input.charAt");

    expect(() =>
      new Parser(
        "frame main() ret int { return 0; }",
        "boundary.bpl",
      ).parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "framex main() ret int { return 0; }",
        "boundary.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("keeps generated frame keyword parsing allocation-free", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const helper = generatedSource.match(
      /function peg\$parseK_frame\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedFrameKeywordParsing");
    expect(helper).toContain("const startPos = peg$currPos;");
    expect(helper).toContain("input.charCodeAt(startPos + 4) === 101");
    expect(helper).toContain("peg$isBplIdentifierContinuationCode");
    expect(helper).toContain("return peg$c20;");
    expect(helper).not.toContain("let s0, s1, s2");
    expect(helper).not.toContain("peg$parseIdBoundary()");
    expect(helper).not.toContain("[s1, s2]");
  });

  it("keeps generated assignment-operator parsing on the direct scanner fast path", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

  it("keeps generated assignment parsing off Peggy tuple arrays", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const assignmentHelper = generatedSource.match(
      /function peg\$parseAssignment\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedAssignmentParsing");
    expect(assignmentHelper).toContain("let result = peg$parseTernary();");
    expect(assignmentHelper).toContain("peg$scanBplAssignmentOperator()");
    expect(assignmentHelper).toContain("result = assignment(");
    expect(assignmentHelper).not.toContain("s2 = []");
    expect(assignmentHelper).not.toContain("s2.push");
    expect(assignmentHelper).not.toContain("[s4, s5, s6, s7]");

    expect(() =>
      new Parser(
        [
          "frame main() ret int {",
          "  local a: int = 1;",
          "  local b: int = 2;",
          "  a = b = 3;",
          "  return a;",
          "}",
        ].join("\n"),
        "assignment-fast-path.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("gates optional generic parameter lists by their opening delimiter", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const gates =
      generatedSource.match(
        /!peg\$collectExpected && input\.charCodeAt\(peg\$currPos\) !== 60\s+\? null\s+: peg\$parseGenericParamList\(\)/g,
      ) ?? [];

    expect(generatorSource).toContain(
      "optimizeGeneratedGenericParamListDispatch",
    );
    expect(gates).toHaveLength(6);
  });

  it("keeps generated simple basic-type parsing off Peggy suffix arrays", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const basicTypeHelper = generatedSource.match(
      /function peg\$parseBasicType\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedBasicTypeParsing");
    expect(basicTypeHelper).toContain(
      "!peg$collectExpected && input.charCodeAt(startPos) !== 42",
    );
    expect(basicTypeHelper).toContain(": peg$parsePointerPrefix();");
    expect(basicTypeHelper).toContain(
      "!peg$collectExpected && input.charCodeAt(peg$currPos) !== 60",
    );
    expect(basicTypeHelper).toContain(": peg$parseGenericArgs();");
    expect(basicTypeHelper).toContain(
      "!peg$collectExpected && input.charCodeAt(peg$currPos) !== 91",
    );
    expect(basicTypeHelper).toContain(": peg$parseArraySuffix();");
    expect(basicTypeHelper).toContain(
      "if (genericArgs === peg$FAILED && firstArraySuffix === peg$FAILED)",
    );
    expect(basicTypeHelper).toContain(
      "return basicType(name, [], pointerDepth, [], location());",
    );
    expect(basicTypeHelper).not.toContain("s4 = []");
    expect(basicTypeHelper).not.toMatch(/peg\$f\d+\(s1, s2, s3, s4\)/);

    expect(() =>
      new Parser(
        [
          "struct Box<T> { value: T }",
          "frame use(a: int, b: *int, c: Box<int>, d: int[2], e: *Box<int>[2]) ret int {",
          "  return 0;",
          "}",
        ].join("\n"),
        "basic-type-fast-path.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("keeps generated expression-operator parsing on direct scanner fast paths", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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
      if (
        operatorName === "AdditiveOperator" ||
        operatorName === "RelationalOperator"
      ) {
        expect(scanner).toContain("makeTypedOperatorTokenFromPos");
      } else {
        expect(scanner).toContain("pos: startPos");
        expect(scanner).toContain("type:");
      }
      expect(scanner).not.toContain("peg$savedPos = startPos");
    }
  });

  it("skips operator expectation dispatch during the fast parser pass", () => {
    const generatedSource = readTextFile(
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
      "AssignmentOperator",
      "LogicalOrOperator",
      "LogicalAndOperator",
      "BitwiseOrOperator",
      "BitwiseXorOperator",
      "BitwiseAndOperator",
      "EqualityOperator",
      "TypeCheckOperator",
      "RelationalOperator",
      "ShiftOperator",
      "AdditiveOperator",
      "MultiplicativeOperator",
      "UnaryOperator",
    ];

    for (const operatorName of operatorNames) {
      const scanner = generatedSource.match(
        new RegExp(`function peg\\$scanBpl${operatorName}\\(\\)[\\s\\S]*?\\n  }`),
      )?.[0];

      expect(scanner).toContain(
        `if (peg$collectExpected) { peg$failBpl${operatorName}Expectation(); }`,
      );
      expect(scanner).not.toContain(
        `\n    peg$failBpl${operatorName}Expectation();`,
      );
    }
    expect(() =>
      new Parser(
        "frame main() ret int { return 1 + ; }",
        "operator-expectation-retry.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("guards every generated inline failure dispatch during the fast parser pass", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const unguardedFailures = generatedSource.match(
      /if \(peg\$silentFails === 0\) \{ peg\$fail\(peg\$e\d+\); }/g,
    );
    const guardedFailures = generatedSource.match(
      /if \(peg\$collectExpected && peg\$silentFails === 0\) \{ peg\$fail\(peg\$e\d+\); }/g,
    );

    expect(generatorSource).toContain("optimizeGeneratedInlineFailureDispatch");
    expect(unguardedFailures).toBeNull();
    expect(guardedFailures?.length).toBeGreaterThan(300);
    expect(() =>
      new Parser(
        "frame main() ret int { return (1 + 2; }",
        "inline-failure-retry.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("returns final typed tokens directly from the additive scanner", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const additiveParser = generatedSource.match(
      /function peg\$parseAdditive\(\)[\s\S]*?\n  }/,
    )?.[0];
    const additiveScanner = generatedSource.match(
      /function peg\$scanBplAdditiveOperator\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedAdditiveOperatorTokens");
    expect(additiveScanner).toContain(
      'return makeTypedOperatorTokenFromPos("Plus", "+", startPos);',
    );
    expect(additiveScanner).toContain(
      'return makeTypedOperatorTokenFromPos("Minus", "-", startPos);',
    );
    expect(additiveScanner).not.toContain('return { op: "+"');
    expect(additiveParser).toContain("        operator,");
    expect(additiveParser).not.toContain("operator.type");
    expect(() =>
      new Parser(
        "frame main() ret int { return 3 + 2 - 1; }",
        "direct-additive-token.bpl",
      ).parse(),
    ).not.toThrow();
  });

  it("returns final typed tokens directly from the relational scanner", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const relationalParser = generatedSource.match(
      /function peg\$parseRelational\(\)[\s\S]*?\n  }/,
    )?.[0];
    const relationalScanner = generatedSource.match(
      /function peg\$scanBplRelationalOperator\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedRelationalOperatorTokens",
    );
    for (const [type, op] of [
      ["GreaterEqual", ">="],
      ["Greater", ">"],
      ["LessEqual", "<="],
      ["Less", "<"],
    ]) {
      expect(relationalScanner).toContain(
        `return makeTypedOperatorTokenFromPos("${type}", "${op}", startPos);`,
      );
      expect(relationalScanner).not.toContain(`return { op: "${op}"`);
    }
    expect(relationalParser).toContain("        operator,");
    expect(relationalParser).not.toContain("operator.type");
    expect(() =>
      new Parser(
        "frame main() ret bool { return 3 >= 2; }",
        "direct-relational-token.bpl",
      ).parse(),
    ).not.toThrow();
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
    const generatedSource = readTextFile(
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
    const grammarSource = readTextFile(
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
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const wrapperSource = readTextFile(
      join(process.cwd(), "compiler", "frontend", "PeggyParser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

  it("skips generated literal expectations on fast parser passes", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const literalExpectationHelper = generatedSource.match(
      /function peg\$literalExpectation\(text, ignoreCase\)[\s\S]*?\n  }/,
    )?.[0];
    const failHelper = generatedSource.match(
      /function peg\$fail\(expected\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain(
      "optimizeGeneratedLiteralExpectationInitialization",
    );
    expect(literalExpectationHelper).toContain(
      "if (options.bplCollectExpected === false) return undefined;",
    );
    expect(
      literalExpectationHelper!.indexOf(
        "if (options.bplCollectExpected === false) return undefined;",
      ),
    ).toBeLessThan(literalExpectationHelper!.indexOf('return { type: "literal"'));
    expect(failHelper).toContain("if (!peg$collectExpected) { return; }");
    expect(() =>
      new Parser("frame main() { return; }", "literal-expectation.bpl").parse(),
    ).not.toThrow();
    expect(() =>
      new Parser(
        "frame main() { local value: char = 'ab'; }",
        "literal-expectation-error.bpl",
      ).parse(),
    ).toThrow(CompilerError);
  });

  it("dispatches declaration statements before the expression fallback", () => {
    const grammarSource = readTextFile(
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

  it("skips top-level error recovery after normal parsing reaches EOF", () => {
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
      join(
        process.cwd(),
        "compiler",
        "frontend",
        "generated",
        "BplParser.js",
      ),
      "utf8",
    );
    const programSource = generatedSource.match(
      /function peg\$parseProgram\(\)[\s\S]*?\n  }/,
    )?.[0];

    expect(generatorSource).toContain("optimizeGeneratedProgramRecoveryGuard");
    expect(
      programSource?.match(/peg\$parseTopLevelErrorRecovery\(\)/g),
    ).toHaveLength(2);
    expect(
      programSource?.match(
        /!peg\$collectExpected && peg\$currPos >= peg\$bplInputLength/g,
      ),
    ).toHaveLength(2);
  });

  it("keeps comment-free parser passes off token comment filtering", () => {
    const source = readTextFile(
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
    const parserSource = readTextFile(
      join(process.cwd(), "compiler", "frontend", "Parser.ts"),
      "utf8",
    );
    const wrapperSource = readTextFile(
      join(process.cwd(), "compiler", "frontend", "PeggyParser.ts"),
      "utf8",
    );
    const generatorSource = readTextFile(
      join(process.cwd(), "tools", "generate_peggy_parser.ts"),
      "utf8",
    );
    const generatedSource = readTextFile(
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

    const grammarSource = readTextFile(grammarPath, "utf8");
    const expectedSource = generateBplParserSource(grammarSource);
    const actualSource = readTextFile(generatedPath, "utf8");

    expect(sha256(actualSource)).toBe(sha256(expectedSource));
  });
});
