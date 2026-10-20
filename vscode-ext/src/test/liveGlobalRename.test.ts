import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  for (const declaration of [
    "frame target() ret int { return 1; }",
    "global target: int = 1;",
    "global const target: int = 1;",
  ]) {
    for (const liveName of ["target", "current"]) {
      for (const fromReference of [false, true]) {
        test(`global rename uses live source for ${declaration} as ${liveName} from ${fromReference ? "reference" : "declaration"} with ${JSON.stringify(newline)}`, () => {
          const dir = mkdtempSync(join(tmpdir(), "bpl-live-rename-"));
          const file = join(dir, "main.bpl");
          const call = declaration.startsWith("frame") ? "target()" : "target";
          const body = `frame main() ret int { return ${call}; }`;
          writeFileSync(file, [declaration, body].join(newline));
          const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
          index.indexFile(file, false);
          // Both the declaration position/name and its references differ from disk.
          const source = ["# unsaved heading", "", declaration, body]
            .join(newline)
            .replaceAll("target", liveName);
          const doc = TextDocument.create(
            pathToFileURL(file).toString(),
            "bpl",
            2,
            source,
          );
          const handler = new ASTRenameHandler(new ASTResolver(index), index);
          try {
            const offset = fromReference
              ? source.lastIndexOf(liveName)
              : source.indexOf(liveName);
            const result = handler.rename(
              {
                textDocument: { uri: doc.uri },
                position: doc.positionAt(offset + 1),
                newName: "renamed",
              },
              doc,
            );
            const edits = result?.changes?.[doc.uri];
            expect(edits).toHaveLength(2);
            expect(
              edits!.every((edit) => doc.getText(edit.range) === liveName),
            ).toBe(true);
            expect(TextDocument.applyEdits(doc, edits!)).toBe(
              source.replaceAll(liveName, "renamed"),
            );
            expect(
              handler.findAllReferences(doc.positionAt(offset + 1), doc),
            ).toHaveLength(2);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        });
      }
    }
  }
}
