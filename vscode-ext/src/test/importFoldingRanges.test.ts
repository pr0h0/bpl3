import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { ASTResolver } from "../services/ASTResolver";
import { FoldingRangeProvider } from "../services/FoldingRangeProvider";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  for (const precedingImport of [false, true]) {
    test(`import folds include the last multiline path (${JSON.stringify(newline)}, preceding=${precedingImport})`, () => {
      const lines = precedingImport
        ? ['import [Array] from "std/array.bpl";']
        : [];
      lines.push(
        "import [",
        "    String",
        '] from "std/string.bpl";',
        "frame main() {}",
        'import [Math] from "std/math.bpl";',
      );
      const uri = pathToFileURL(resolve("tmp/import-folding.bpl")).toString();
      const doc = TextDocument.create(uri, "bpl", 1, lines.join(newline));
      const provider = new FoldingRangeProvider(
        new ASTResolver(new SymbolIndex()),
      );
      const imports = provider
        .handle({ textDocument: { uri } }, doc)
        ?.filter((range) => range.kind === "imports");
      expect(imports).toEqual([
        { startLine: 0, endLine: precedingImport ? 3 : 2, kind: "imports" },
      ]);
      expect(
        doc.getText({
          start: { line: imports![0]!.endLine, character: 0 },
          end: { line: imports![0]!.endLine + 1, character: 0 },
        }),
      ).toContain('] from "std/string.bpl";');
    });
  }
}

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`import folds do not hide a declaration on the closing import line (${JSON.stringify(newline)})`, () => {
    const uri = pathToFileURL(
      resolve("tmp/import-folding-shared-line.bpl"),
    ).toString();
    const content = [
      'import [Array] from "std/array.bpl";',
      "import [",
      "    String",
      '] from "std/string.bpl"; frame main() {}',
    ].join(newline);
    const doc = TextDocument.create(uri, "bpl", 1, content);
    const provider = new FoldingRangeProvider(
      new ASTResolver(new SymbolIndex()),
    );
    const ranges = provider.handle({ textDocument: { uri } }, doc) ?? [];
    expect(ranges.filter((range) => range.kind === "imports")).toEqual([]);
  });
}
