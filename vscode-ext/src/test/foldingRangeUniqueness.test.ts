import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { ASTResolver } from "../services/ASTResolver";
import { FoldingRangeProvider } from "../services/FoldingRangeProvider";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`folding returns each multiline region once with ${JSON.stringify(newline)}`, () => {
    const uri = pathToFileURL(resolve("tmp/folding-unique.bpl")).toString();
    const content = [
      'import [String] from "std/string.bpl";',
      'import [Array] from "std/array.bpl";',
      "",
      "frame sample() {",
      "    if (true) {",
      "        loop (false) {",
      "            break;",
      "        }",
      "    }",
      "    try {",
      "        return;",
      "    } catch {",
      "        return;",
      "    }",
      "}",
    ].join(newline);
    const doc = TextDocument.create(uri, "bpl", 1, content);
    const provider = new FoldingRangeProvider(
      new ASTResolver(new SymbolIndex()),
    );
    const ranges = provider.handle({ textDocument: { uri } }, doc);
    expect(
      ranges
        ?.map((range) => `${range.startLine}:${range.endLine}:${range.kind}`)
        .sort(),
    ).toEqual(
      [
        "0:1:imports",
        "3:14:region",
        "4:8:region",
        "5:7:region",
        "9:11:region",
        "11:13:region",
      ].sort(),
    );
  });
}

test("multiline signatures with single-line bodies do not produce empty folds", () => {
  const uri = pathToFileURL(resolve("tmp/folding-signature.bpl")).toString();
  const doc = TextDocument.create(
    uri,
    "bpl",
    1,
    "frame sample(\n) { return; }",
  );
  const provider = new FoldingRangeProvider(new ASTResolver(new SymbolIndex()));
  expect(provider.handle({ textDocument: { uri } }, doc)).toBeNull();
});
