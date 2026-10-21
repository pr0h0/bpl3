import { expect, test } from "bun:test";
import { resolve } from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  for (const declaration of [
    "frame target() {}",
    "global target: int = 1;",
    "global const target: int = 1;",
    "type target = int;",
    "struct target {}",
    "enum target { Value, }",
  ]) {
    test(`exported rename declines incomplete edits for ${declaration} with ${JSON.stringify(newline)}`, () => {
      const source = declaration + newline + "export target;";
      const doc = TextDocument.create(
        "file:///tmp/bpl-exported-rename.bpl",
        "bpl",
        1,
        source,
      );
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      const position = doc.positionAt(source.indexOf("target") + 1);
      expect(
        handler.prepareRename(
          { textDocument: { uri: doc.uri }, position },
          doc,
        ),
      ).toBeNull();
      expect(
        handler.rename(
          { textDocument: { uri: doc.uri }, position, newName: "updated" },
          doc,
        ),
      ).toBeNull();
      expect(handler.findAllReferences(position, doc)?.length).toBeGreaterThan(
        0,
      );
    });
  }
}
