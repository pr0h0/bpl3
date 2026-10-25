import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TokenType } from "../compiler/frontend/TokenType";
import { Parser } from "../compiler/frontend/Parser";

for (const text of [
  "/# outer /# inner #/ end #/",
  "/# one /# two /# three #/ two #/ one #/",
]) {
  test(`collects a nested block comment once: ${text}`, () => {
    const source = `frame main(){f(1, ${text} 2);}`;
    const tokens = lexWithGrammar(source, "nested.bpl");
    expect(
      tokens
        .filter((token) => token.type === TokenType.Comment)
        .map((token) => token.lexeme),
    ).toEqual([text]);
    expect(
      tokens
        .filter(
          (token) =>
            token.type !== TokenType.Comment && token.type !== TokenType.EOF,
        )
        .map((token) => token.lexeme),
    ).toEqual([
      "frame",
      "main",
      "(",
      ")",
      "{",
      "f",
      "(",
      "1",
      ",",
      "2",
      ")",
      ";",
      "}",
    ]);
  });
}

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`line comments exclude ${JSON.stringify(newline)} and positions match the grammar`, () => {
    const source = `# first${newline}frame main(){} # last${newline}`;
    const tokens = lexWithGrammar(source, "lines.bpl");
    const actual = tokens
      .filter((token) => token.type === TokenType.Comment)
      .map((token) => [token.line, token.column, token.lexeme]);
    const expected = new Parser(source, "lines.bpl")
      .parse()
      .comments?.map((token) => [token.line, token.column, token.lexeme]);
    expect(actual).toEqual(expected ?? []);
  });
}

test("nested block comment newlines preserve following comment positions", () => {
  const source =
    "/# outer\r\n /# inner #/\r\n end #/\r\n# after\r\nframe main(){}";
  const tokens = lexWithGrammar(source, "lines.bpl");
  expect(
    tokens
      .filter((token) => token.type === TokenType.Comment)
      .map((token) => [token.line, token.column, token.lexeme]),
  ).toEqual([
    [1, 1, "/# outer\r\n /# inner #/\r\n end #/"],
    [4, 1, "# after"],
  ]);
});
