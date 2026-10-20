import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TokenType } from "../compiler/frontend/TokenType";
import { Formatter } from "../compiler/formatter/Formatter";
import { CompilerError } from "../compiler/common/CompilerError";
import { DiagnosticFormatter } from "../compiler/common/DiagnosticFormatter";
import { SourceManager } from "../compiler/common/SourceManager";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { formatterSemantics } from "./helpers/formatterSemantics";

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`absolute token, AST and comment positions for ${JSON.stringify(newline)}`, () => {
    const source = [
      "# first",
      "frame main() {",
      "    /# block",
      "       body #/",
      "    local x: int = 1; # last",
      "}",
    ].join(newline);
    const tokens = lexWithGrammar(source, "lines.bpl");
    expect(tokens.find((t) => t.lexeme === "frame")).toMatchObject({
      line: 2,
      column: 1,
    });
    expect(tokens.find((t) => t.lexeme === "local")).toMatchObject({
      line: 5,
      column: 5,
    });
    expect(
      tokens
        .filter((t) => t.type === TokenType.Comment)
        .map((t) => [t.line, t.column]),
    ).toEqual([
      [1, 1],
      [3, 5],
      [5, 23],
    ]);
    for (const inputTokens of [[], tokens]) {
      const ast = new Parser(source, "lines.bpl", inputTokens).parse();
      expect(ast.statements[0]!.location).toMatchObject({
        startLine: 2,
        startColumn: 1,
        endLine: 6,
        endColumn: 2,
      });
      expect(ast.comments?.map((t) => [t.line, t.column])).toEqual([
        [1, 1],
        [3, 5],
        [5, 23],
      ]);
      const output = new Formatter().format(ast, source);
      expect(output).toBe(
        "# first\nframe main() {\n    /# block\n       body #/\n    local x: int = 1; # last\n}\n",
      );
      expect(
        formatterSemantics(new Parser(output, "lines.bpl").parse()),
      ).toEqual(formatterSemantics(ast));
      expect(
        new Formatter().format(new Parser(output, "lines.bpl").parse(), output),
      ).toBe(output);
    }
  });

  test(`syntax diagnostics after ${JSON.stringify(newline)}`, () => {
    try {
      new Parser(
        ["frame main() {", "", "    @", "}"].join(newline),
        "lines.bpl",
      ).parse();
      throw new Error("Expected syntax error");
    } catch (error) {
      expect(error).toBeInstanceOf(CompilerError);
      expect((error as CompilerError).location).toMatchObject({
        startLine: 3,
        startColumn: 5,
      });
    }
  });

  for (const cached of [false, true]) {
    test(`source snippets for ${JSON.stringify(newline)}, cached=${cached}`, () => {
      const dir = mkdtempSync(join(tmpdir(), "bpl-lines-"));
      const file = join(dir, "source.bpl");
      const source = ["first", "second", "third"].join(newline);
      if (cached) SourceManager.setSource(file, source);
      else writeFileSync(file, source);
      try {
        const error = new CompilerError("test error", "", {
          file,
          startLine: 2,
          startColumn: 1,
          endLine: 2,
          endColumn: 7,
        });
        for (const output of [
          error.toString(),
          new DiagnosticFormatter({ colorize: false }).formatError(error),
        ]) {
          expect(output).toContain("2 | second");
          expect(output).not.toContain("\r");
        }
      } finally {
        SourceManager.clear();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

test("mixed newline styles inside and after multiline literals", () => {
  const source =
    "frame main() {\r\n    local s: string = `one\rtwo\r\nthree\nfour`;\r    # after\n    local x: int = 1;\r}";
  const tokens = lexWithGrammar(source, "mixed.bpl");
  expect(
    tokens.filter((t) => t.lexeme === "local").map((t) => [t.line, t.column]),
  ).toEqual([
    [2, 5],
    [7, 5],
  ]);
  expect(tokens.find((t) => t.type === TokenType.Comment)).toMatchObject({
    line: 6,
    column: 5,
  });
  const ast = new Parser(source, "mixed.bpl", tokens).parse();
  expect(ast.comments?.[0]).toMatchObject({ line: 6, column: 5 });
});

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`comment-free lexer positions for ${JSON.stringify(newline)}`, () => {
    const source = ["frame main() {", "    local x: int = 1;", "}"].join(
      newline,
    );
    expect(
      lexWithGrammar(source, "plain.bpl").find((t) => t.lexeme === "local"),
    ).toMatchObject({ line: 2, column: 5 });
    expect(
      new Parser(source, "plain.bpl").parse().statements[0]!.location,
    ).toMatchObject({ endLine: 3, endColumn: 2 });
  });
}

test("formatting mixed newlines preserves literal bytes in native execution", () => {
  const source =
    'import [String] from "std/string.bpl";\rimport [printf] from "std/c.bpl";\rframe main() {\r    # before\r    local s: String = `one\rtwo\r\nthree\nfour`;\r    printf("%s", s.data); # after\r    s.destroy();\r}';
  const ast = new Parser(source, "literal.bpl").parse();
  const formatted = new Formatter().format(ast, source);
  expect(
    formatterSemantics(new Parser(formatted, "literal.bpl").parse()),
  ).toEqual(formatterSemantics(ast));
  expect(
    new Formatter().format(
      new Parser(formatted, "literal.bpl").parse(),
      formatted,
    ),
  ).toBe(formatted);
  expectCorrectnessSuite([
    {
      name: "original-mixed-line-endings",
      source,
      expectedStdout: "one\rtwo\r\nthree\nfour",
    },
    {
      name: "formatted-mixed-line-endings",
      source: formatted,
      expectedStdout: "one\rtwo\r\nthree\nfour",
    },
  ]);
}, 30000);

for (const newline of ["\n", "\r\n", "\r"]) {
  for (const breaks of [1, 2, 3]) {
    test(`comment spacing counts ${breaks} logical ${JSON.stringify(newline)} breaks`, () => {
      const expectedGap = "\n".repeat(Math.min(breaks, 2));
      const cases = [
        {
          source: `# heading${newline.repeat(breaks)}frame main() {}`,
          expected: `# heading${expectedGap}frame main() {\n}\n`,
        },
        {
          source: `frame main() {${newline}    local x: int = 1;${newline.repeat(breaks)}    # note${newline}}`,
          expected: `frame main() {\n    local x: int = 1;${expectedGap}    # note\n}\n`,
        },
      ];
      for (const { source, expected } of cases) {
        const result = new Formatter().format(
          new Parser(source, "spacing.bpl").parse(),
          source,
        );
        expect(result).toBe(expected);
        expect(
          new Formatter().format(
            new Parser(result, "spacing.bpl").parse(),
            result,
          ),
        ).toBe(result);
      }
    });
  }
}
