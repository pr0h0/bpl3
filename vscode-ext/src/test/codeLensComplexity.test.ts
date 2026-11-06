import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { ASTResolver } from "../services/ASTResolver";
import { CodeLensProvider } from "../services/CodeLensProvider";
import { SymbolIndex } from "../services/SymbolIndex";

const cases: [string, string, number | null][] = [
  ["if condition", "if (a && b) { return true; } return false;", 3],
  ["loop condition", "loop (a || b) { break; } return false;", 3],
  ["return expression", "return a && b;", 2],
  ["initializer", "local value: bool = a || b; return value;", 2],
  ["call argument", "consume(a && b); return false;", 2],
  ["ternary", "return a ? b : (a && b);", 3],
  [
    "nested lambda",
    "local f: Lambda<bool>() = || ret bool { if (a && b) { return true; } return false; }; return true;",
    null,
  ],
  ["straight line", "return true;", null],
];
for (const [name, body, expected] of cases) {
  test(`complexity counts decisions in ${name}`, () => {
    const uri = pathToFileURL(
      resolve("tmp/complexity-expressions.bpl"),
    ).toString();
    const doc = TextDocument.create(
      uri,
      "bpl",
      1,
      `frame sample(a: bool, b: bool) ret bool { ${body} }`,
    );
    const provider = new CodeLensProvider(new ASTResolver(new SymbolIndex()));
    const titles = provider
      .provide({ textDocument: { uri } }, doc)
      .map((lens) => lens.command?.title)
      .filter((title) => title?.startsWith("complexity:"));
    expect(titles).toEqual(
      expected === null ? [] : [`complexity: ${expected}`],
    );
  });
}
