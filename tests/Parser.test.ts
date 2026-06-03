import { describe, expect, it } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

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
