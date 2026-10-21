import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "path";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  const source = [
    "frame /# target #/ target() {",
    "    # target stays a comment",
    "}",
  ].join(newline);
  for (const offset of [
    1,
    source.indexOf("/#") + 4,
    source.indexOf("target()") - 1,
    source.indexOf("# target stays") + 3,
    source.lastIndexOf("}"),
  ]) {
    test(`rename rejects non-name cursor ${offset} with ${JSON.stringify(newline)}`, () => {
      const doc = TextDocument.create(
        "file:///tmp/bpl-cursor-rename.bpl",
        "bpl",
        1,
        source,
      );
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      const position = doc.positionAt(offset);
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
      expect(handler.findAllReferences(position, doc)).toBeNull();
    });
  }
  for (const delta of [0, 1, "target".length]) {
    test(`rename accepts name cursor ${delta} with ${JSON.stringify(newline)}`, () => {
      const doc = TextDocument.create(
        "file:///tmp/bpl-cursor-rename.bpl",
        "bpl",
        1,
        source,
      );
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      const position = doc.positionAt(source.indexOf("target()") + delta);
      const range = handler.prepareRename(
        { textDocument: { uri: doc.uri }, position },
        doc,
      );
      expect(range).not.toBeNull();
      expect(doc.getText(range!)).toBe("target");
      expect(
        handler.rename(
          { textDocument: { uri: doc.uri }, position, newName: "updated" },
          doc,
        )?.changes?.[doc.uri],
      ).toHaveLength(1);
      expect(handler.findAllReferences(position, doc)).toHaveLength(1);
    });
  }
}
