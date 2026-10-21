import { expect, spyOn, test } from "bun:test";
import { resolve } from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTResolver } from "../services/ASTResolver";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  for (const operation of ["prepare", "rename", "references"]) {
    test(`${operation} declines a failed live parse instead of using old AST with ${JSON.stringify(newline)}`, () => {
      const uri = "file:///tmp/bpl-failed-rename.bpl";
      const valid = TextDocument.create(uri, "bpl", 1, "frame target() {}");
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      const position = valid.positionAt(valid.getText().indexOf("target") + 1);
      expect(
        handler.prepareRename({ textDocument: { uri }, position }, valid),
      ).not.toBeNull();
      const invalid = TextDocument.create(
        uri,
        "bpl",
        2,
        valid.getText() + newline + '"unterminated',
      );
      const errorLog = spyOn(console, "error").mockImplementation(() => {});
      try {
        let result;
        if (operation === "prepare") {
          result = handler.prepareRename(
            { textDocument: { uri }, position },
            invalid,
          );
        } else if (operation === "rename") {
          result = handler.rename(
            { textDocument: { uri }, position, newName: "updated" },
            invalid,
          );
        } else {
          result = handler.findAllReferences(position, invalid);
        }
        expect(result).toBeNull();
      } finally {
        errorLog.mockRestore();
      }
    });
  }
}
