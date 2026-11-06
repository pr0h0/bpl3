import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileURL } from "url";
import { join, resolve } from "path";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { DocumentSymbolProvider } from "../services/DocumentSymbolProvider";
import { FoldingRangeProvider } from "../services/FoldingRangeProvider";
import { CodeLensProvider } from "../services/CodeLensProvider";
import { SelectionRangeProvider } from "../services/SelectionRangeProvider";
import { InlayHintProvider } from "../services/InlayHintProvider";

const root = resolve(import.meta.dir, "../../..");
for (const feature of ["symbols", "folding", "lenses", "selection", "hints"]) {
  test(`${feature} ignores stale ASTs after malformed edits and recovers`, () => {
    const uri = pathToFileURL(join(root, "tmp/stale-features.bpl")).toString();
    const index = new SymbolIndex(root);
    const resolver = new ASTResolver(index);
    const params = {
      textDocument: { uri },
      positions: [{ line: 1, character: 11 }],
      range: {
        start: { line: 0, character: 0 },
        end: { line: 10, character: 0 },
      },
    };
    const providers = {
      symbols: (doc: TextDocument) =>
        new DocumentSymbolProvider(resolver).handle(params, doc),
      folding: (doc: TextDocument) =>
        new FoldingRangeProvider(resolver).handle(params, doc),
      lenses: (doc: TextDocument) =>
        new CodeLensProvider(resolver).provide(params, doc),
      selection: (doc: TextDocument) =>
        new SelectionRangeProvider(resolver).handle(params, doc),
      hints: (doc: TextDocument) =>
        new InlayHintProvider(resolver, index).handle(params, doc),
    };
    const request = providers[feature as keyof typeof providers];
    const content =
      "frame helper(value: int) ret int {\n    return value;\n}\nframe main() {\n    local result = 1;\n}";
    const valid = TextDocument.create(uri, "bpl", 1, content);
    const initial = request(valid);
    expect(initial?.length).toBeGreaterThan(0);
    const originalError = console.error;
    console.error = () => {};
    try {
      const malformed = TextDocument.create(uri, "bpl", 2, '"unfinished');
      expect(request(malformed)?.length ?? 0).toBe(0);
    } finally {
      console.error = originalError;
    }
    const repaired = TextDocument.create(uri, "bpl", 3, content);
    expect(request(repaired)).toEqual(initial);
  });
}
