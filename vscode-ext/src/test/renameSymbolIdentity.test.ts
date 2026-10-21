import { expect, test } from "bun:test";
import { resolve } from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  for (const owner of [
    "struct Item { frame target() ret int { return 2; } }",
    "enum Item { Value, frame target() ret int { return 2; } }",
  ]) {
    test(`method rename never redirects to a same-named global: ${owner} ${JSON.stringify(newline)}`, () => {
      const source = [
        "frame target() ret int { return 1; }",
        owner,
        "frame main() ret int { return target(); }",
      ].join(newline);
      const doc = TextDocument.create(
        "file:///tmp/bpl-method-identity.bpl",
        "bpl",
        1,
        source,
      );
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      const position = doc.positionAt(
        source.indexOf("target", source.indexOf(owner)) + 1,
      );
      expect(
        handler.rename(
          { textDocument: { uri: doc.uri }, position, newName: "updated" },
          doc,
        ),
      ).toBeNull();
      expect(handler.findAllReferences(position, doc)).toEqual([]);
      const globalPosition = doc.positionAt(source.indexOf("target") + 1);
      const globalEdits = handler.rename(
        {
          textDocument: { uri: doc.uri },
          position: globalPosition,
          newName: "updated",
        },
        doc,
      )?.changes?.[doc.uri];
      expect(
        globalEdits?.some(
          (edit) =>
            edit.range.start.line === 0 && doc.getText(edit.range) === "target",
        ),
      ).toBe(true);
    });
  }
}
