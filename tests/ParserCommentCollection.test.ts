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
