import { describe, expect, it } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as peggy from "peggy";

import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

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
    const expectedSource = peggy.generate(grammarSource, {
      output: "source",
      format: "es",
      cache: false,
    }).replace(/[ \t]+$/gm, "");
    const actualSource = readFileSync(generatedPath, "utf8");

    expect(sha256(actualSource)).toBe(sha256(expectedSource));
  });
});
