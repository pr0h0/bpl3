import { describe, it, expect } from "bun:test";
import { GrammarParser } from "../grammar/GrammarParser";
import { join } from "path";

describe("GrammarParser", () => {
  it("should parse grammar.bpl file correctly", () => {
    // Assuming the test runs from the project root or we can locate grammar.bpl relative to this file
    // import.meta.dir is the directory of the test file (tests/)
    const grammarPath = join(import.meta.dir, "../grammar/grammar.bpl");
    const parser = new GrammarParser(grammarPath);
    const grammar = parser.parse();

    expect(grammar.rules.size).toBeGreaterThan(0);
    expect(grammar.rules.has("Program")).toBe(true);
    expect(grammar.startRule).toBe("Program");

    // Check a specific rule
    const literalRule = grammar.rules.get("BoolLiteral");
    expect(literalRule).toBeDefined();
    expect(literalRule?.definition).toContain("'true'");
    expect(literalRule?.definition).toContain("'false'");

    // Check if comments are stripped (implied validity)
    // Check if Program rule references Statement
    const programRule = grammar.rules.get("Program");
    expect(programRule?.definition).toContain("Statement");
  });

  it("should handle complex rules with quotes and comments", () => {
    const grammarPath = join(import.meta.dir, "../grammar/grammar.bpl");
    const parser = new GrammarParser(grammarPath);
    const grammar = parser.parse();

    const stringLiteral = grammar.rules.get("StringLiteral");
    expect(stringLiteral).toBeDefined();
    // StringLiteral = '"' ( '\\' . | [^"\n\r] )* '"';
    expect(stringLiteral?.definition).toContain("'\"'");
    expect(stringLiteral?.definition).toContain('[^"\\n\\r]'); // Note: \n and \r might be escaped or raw

    const importStatement = grammar.rules.get("ImportStatement");
    expect(importStatement).toBeDefined();
    // 'import' '*' 'as' Identifier ...
    expect(importStatement?.definition).toContain("'import'");
    expect(importStatement?.definition).toContain("'*'");
  });
});
