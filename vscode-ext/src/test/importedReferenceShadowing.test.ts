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
  for (const shadow of [
    "frame run(){local cb:Lambda<int>(int)=|target:int| ret int{return target;};}",
    "frame run(){match(1){target if target > 0 => target, _ => 0,};}",
  ]) {
    test(`reference lookup never maps local bindings to an import: ${shadow} ${JSON.stringify(newline)}`, () => {
      const dir = mkdtempSync(join(tmpdir(), "bpl-import-shadow-"));
      const file = join(dir, "main.bpl");
      const moduleFile = join(dir, "values.bpl");
      const source = [
        'import [target] from "./values.bpl";',
        shadow,
        "frame read()ret int{return target;}",
      ].join(newline);
      writeFileSync(file, source);
      writeFileSync(moduleFile, "global target:int=1; export target;");
      const doc = TextDocument.create(
        pathToFileURL(file).toString(),
        "bpl",
        1,
        source,
      );
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      index.indexFile(moduleFile, false);
      index.indexFile(file, false);
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      try {
        const offset =
          source.indexOf(shadow) + shadow.lastIndexOf("target") + 1;
        const local = handler.findAllReferences(doc.positionAt(offset), doc);
        expect(local?.every((ref) => ref.uri === doc.uri)).toBe(true);
        const global = handler.findAllReferences(
          doc.positionAt(source.lastIndexOf("target") + 1),
          doc,
        );
        expect(
          global?.some(
            (ref) => ref.uri === pathToFileURL(moduleFile).toString(),
          ),
        ).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}
