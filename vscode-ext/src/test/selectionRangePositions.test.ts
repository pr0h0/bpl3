import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileURL } from "url";
import { join, resolve } from "path";
import { ASTResolver } from "../services/ASTResolver";
import { SelectionRangeProvider } from "../services/SelectionRangeProvider";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`selection results preserve cursor correspondence with ${JSON.stringify(newline)}`, () => {
    const root = resolve(import.meta.dir, "../../..");
    const uri = pathToFileURL(
      join(root, "tmp/selection-positions.bpl"),
    ).toString();
    const content = [
      "# 😀 comment",
      "",
      "frame main() {",
      "    local value: int = 1;",
      "}",
      "",
      "# trailing comment",
    ].join(newline);
    const doc = TextDocument.create(uri, "bpl", 1, content);
    const provider = new SelectionRangeProvider(
      new ASTResolver(new SymbolIndex(root)),
    );
    const positions = [
      { line: 0, character: 4 },
      { line: 3, character: 11 },
      { line: 1, character: 0 },
      { line: 6, character: 3 },
      doc.positionAt(content.length),
    ];
    const results = provider.handle({ textDocument: { uri }, positions }, doc);
    expect(results).toHaveLength(positions.length);
    for (let i = 0; i < positions.length; i++) {
      const offset = doc.offsetAt(positions[i]!);
      const result = results![i]!;
      expect(doc.offsetAt(result.range.start) <= offset).toBe(true);
      expect(doc.offsetAt(result.range.end)).toBeGreaterThanOrEqual(offset);
      let child = result;
      while (child.parent) {
        expect(
          doc.offsetAt(child.parent.range.start) <=
            doc.offsetAt(child.range.start),
        ).toBe(true);
        expect(doc.offsetAt(child.parent.range.end)).toBeGreaterThanOrEqual(
          doc.offsetAt(child.range.end),
        );
        child = child.parent;
      }
    }
    expect(doc.getText(results![1]!.range)).toContain("value");
  });
}

test("selection ranges preserve all positions in a comment-only document", () => {
  const uri = pathToFileURL(resolve("tmp/comment-selections.bpl")).toString();
  const doc = TextDocument.create(uri, "bpl", 1, "# comment\n\n");
  const provider = new SelectionRangeProvider(
    new ASTResolver(new SymbolIndex()),
  );
  const positions = [
    { line: 0, character: 2 },
    { line: 1, character: 0 },
    { line: 0, character: 2 },
  ];
  expect(provider.handle({ textDocument: { uri }, positions }, doc)).toEqual(
    positions.map((position) => ({
      range: { start: position, end: position },
    })),
  );
});
