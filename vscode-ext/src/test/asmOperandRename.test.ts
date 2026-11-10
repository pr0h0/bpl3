import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "path";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

// BUG-516: operands such as `(a)` and `(=result)` name variables, so rename
// updates them with the declaration.
for (const newline of ["\n", "\r\n", "\r"]) {
  for (const [label, from] of [
    ["the declaration", "local value"],
    ["an operand", "(value"],
    ["an output operand", "(=out"],
  ] as const) {
    test(`rename from ${label} updates asm operands with ${JSON.stringify(newline)}`, () => {
      const source = [
        "frame main() ret int {",
        "    local value: int = 5;",
        "    local out: int = 0;",
        '    asm("intel") {',
        "        mov eax, (value)",
        '        add eax, (value: "r")',
        "        mov (=out), eax",
        '        [ "eax" ]',
        "    }",
        "    return out + value;",
        "}",
      ].join(newline);
      const doc = TextDocument.create(
        "file:///tmp/bpl-asm-operand-rename.bpl",
        "bpl",
        1,
        source,
      );
      const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
      const handler = new ASTRenameHandler(new ASTResolver(index), index);
      const target = from.includes("out") ? "out" : "value";
      const result = handler.rename(
        {
          textDocument: { uri: doc.uri },
          position: doc.positionAt(source.indexOf(from) + from.length - 1),
          newName: "renamed",
        },
        doc,
      );
      const edits = result?.changes?.[doc.uri];
      expect(edits).toBeDefined();
      expect(TextDocument.applyEdits(doc, edits!)).toBe(
        source.replace(new RegExp(`\\b${target}\\b`, "g"), "renamed"),
      );
    });
  }
}
