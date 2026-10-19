import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { formatSource } from "../cli/commands/formatEngine";

for (const comment of [
  "# field",
  "/# field #/",
  "/# outer /# nested #/ end #/",
]) {
  test(`collects a trailing struct comment once: ${comment}`, () => {
    const source = `struct Point{value:int, ${comment}\n}\n`;
    const comments = new Parser(source, "comments.bpl").parse().comments ?? [];
    expect(comments.map((token) => token.lexeme)).toEqual([comment]);
    const first = formatSource(source, "comments.bpl");
    expect(formatSource(first, "comments.bpl")).toBe(first);
  });
}

test("retains identical comments at distinct source positions", () => {
  const source = "struct Point{\nfirst:int, # field\nsecond:int, # field\n}\n";
  const comments = new Parser(source, "comments.bpl").parse().comments ?? [];
  expect(
    comments.map((token) => [token.line, token.column, token.lexeme]),
  ).toEqual([
    [2, 12, "# field"],
    [3, 13, "# field"],
  ]);
});

test("direct parsing and parsing with lexer tokens agree on comment collection", () => {
  const source =
    'struct Point{\nvalue:int, # field\n}\nframe main(){local text:string="# not a comment";}\n';
  const direct = new Parser(source, "comments.bpl").parse().comments;
  const tokenized = new Parser(
    source,
    "comments.bpl",
    lexWithGrammar(source, "comments.bpl"),
  ).parse().comments;
  const positions = (comments: typeof direct) =>
    (comments ?? []).map((token) => [token.line, token.column, token.lexeme]);
  expect(positions(direct)).toEqual(positions(tokenized));
});

for (const prefix of ["", "# outside\n"]) {
  test(`retains interpolation-expression comments with lexer tokens: ${JSON.stringify(prefix)}`, () => {
    const source =
      prefix +
      "frame main(){local text:string=`literal # text ${1 /# inside #/ + 2}`;}";
    const direct = new Parser(source, "template.bpl").parse().comments ?? [];
    const tokenized =
      new Parser(
        source,
        "template.bpl",
        lexWithGrammar(source, "template.bpl"),
      ).parse().comments ?? [];
    const positions = (comments: typeof direct) =>
      comments.map((token) => [token.line, token.column, token.lexeme]);
    expect(positions(tokenized)).toEqual(positions(direct));
    expect(tokenized.map((token) => token.lexeme)).toEqual(
      prefix ? ["# outside", "/# inside #/"] : ["/# inside #/"],
    );
  });
}

test("grammar and lexer comments at the same position remain one comment with CRLF", () => {
  const source = "struct Point{\r\nvalue:int, # field\r\n}\r\n";
  const direct = new Parser(source, "crlf.bpl").parse().comments ?? [];
  const tokenized =
    new Parser(source, "crlf.bpl", lexWithGrammar(source, "crlf.bpl")).parse()
      .comments ?? [];
  expect(
    tokenized.map((token) => [token.line, token.column, token.lexeme]),
  ).toEqual(direct.map((token) => [token.line, token.column, token.lexeme]));
});
