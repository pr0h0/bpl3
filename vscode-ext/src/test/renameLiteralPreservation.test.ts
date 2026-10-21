import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "path";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

for (const newline of ["\n", "\r\n", "\r"]) {
  for (const declaration of [
    "frame target() ret int { return 1; }",
    "extern target() ret int;",
    "type target = int;",
  ]) {
    test(`rename preserves comment and literal text for ${declaration} with ${JSON.stringify(newline)}`, () => {
      const expression = declaration.startsWith("type")
        ? "sizeof<target>()"
        : "target()";
      const source = [
        declaration,
        "# target stays in documentation",
        "/# target /# nested target #/ target #/",
        'frame main() { local text: string = "target";',
        "local interpolated: string = `target ${" + expression + "} target`; }",
      ].join(newline);
      const doc = TextDocument.create(
        "file:///tmp/bpl-literal-rename.bpl",
        "bpl",
        1,
        source,
      );
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      const result = handler.rename(
        {
          textDocument: { uri: doc.uri },
          position: doc.positionAt(source.indexOf("target") + 1),
          newName: "updated",
        },
        doc,
      );
      const edits = result?.changes?.[doc.uri];
      expect(edits).toHaveLength(2);
      const expected = source
        .replace(declaration, declaration.replace("target", "updated"))
        .replace(
          "${" + expression + "}",
          "${" + expression.replace("target", "updated") + "}",
        );
      expect(TextDocument.applyEdits(doc, edits!)).toBe(expected);
    });
  }
}

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`rename finds nested/multiline interpolation expressions with ${JSON.stringify(newline)}`, () => {
    const source = [
      "global target: int = 1;",
      "frame main() { local value: string = `target ${",
      "    `target ${target} target`",
      "} target ${target + 1} target`; }",
    ].join(newline);
    const doc = TextDocument.create(
      "file:///tmp/bpl-nested-rename.bpl",
      "bpl",
      1,
      source,
    );
    const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
    const handler = new ASTRenameHandler(new ASTResolver(index), index);
    const result = handler.rename(
      {
        textDocument: { uri: doc.uri },
        position: doc.positionAt(source.indexOf("target") + 1),
        newName: "updated",
      },
      doc,
    );
    const edits = result?.changes?.[doc.uri];
    expect(edits).toHaveLength(3);
    expect(TextDocument.applyEdits(doc, edits!)).toBe(
      source
        .replace("global target", "global updated")
        .replace("${target}", "${updated}")
        .replace("${target +", "${updated +"),
    );
  });
}
