import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { Parser } from "../../../compiler/frontend/Parser";

function withFile(
  source: string,
  run: (doc: TextDocument, handler: ASTRenameHandler) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), "bpl-rename-ranges-"));
  const file = join(dir, "main.bpl");
  writeFileSync(file, source);
  const doc = TextDocument.create(
    pathToFileURL(file).toString(),
    "bpl",
    1,
    source,
  );
  const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
  index.indexFile(file, false);
  try {
    run(doc, new ASTRenameHandler(new ASTResolver(index), index));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
for (const newline of ["\n", "\r\n", "\r"]) {
  const declarations = [
    {
      source: "type " + " ".repeat(1200) + "Target = int;",
      name: "Target",
      at: "Target =",
    },
    {
      source: "frame target(value: int) ret int { return value; }",
      name: "target",
      at: "target(",
    },
    { source: "struct Target { value: int, }", name: "Target", at: "Target {" },
    {
      source: "enum Target { First, Second, }",
      name: "Target",
      at: "Target {",
    },
    {
      source: "type /# Target #/ Target<T> = T;",
      name: "Target",
      at: "Target<T>",
    },
    {
      source: "extern /# target #/ target(value: int);",
      name: "target",
      at: "target(value",
    },
    {
      source: "frame run() { local const target: int = 1; }",
      name: "target",
      at: "target:",
    },
    {
      source: ["frame run(", "    const", "    target: int", ") {}"].join(
        newline,
      ),
      name: "target",
      at: "target:",
    },
  ];
  for (const { source, name, at } of declarations) {
    test(`prepare rename selects declaration name ${source.length > 200 ? "long alias header" : JSON.stringify(source)} with ${JSON.stringify(newline)}`, () => {
      withFile("# heading" + newline + source, (doc, handler) => {
        const offset = doc.getText().indexOf(at);
        const range = handler.prepareRename(
          {
            textDocument: { uri: doc.uri },
            position: doc.positionAt(offset + 1),
          },
          doc,
        );
        expect(range).not.toBeNull();
        expect(doc.getText(range!)).toBe(name);
        expect(range).toEqual({
          start: doc.positionAt(offset),
          end: doc.positionAt(offset + name.length),
        });
      });
    });
  }
  for (const { lines, name } of [
    {
      name: "target",
      lines: [
        "frame target(value: int) ret int { return value + 1; }",
        "frame main() ret int { return target(1) - 2; }",
      ],
    },
    {
      name: "Target",
      lines: [
        "struct Target { value: int, }",
        "frame main() { local item: Target = Target { value: 1 }; }",
      ],
    },
  ]) {
    test(`rename edits preserve ${name} declarations and bodies with ${JSON.stringify(newline)}`, () => {
      const source = lines.join(newline);
      withFile(source, (doc, handler) => {
        const offset = source.indexOf(name);
        const result = handler.rename(
          {
            textDocument: { uri: doc.uri },
            position: doc.positionAt(offset + 1),
            newName: "Renamed",
          },
          doc,
        );
        const edits = result?.changes?.[doc.uri];
        expect(edits).toBeDefined();
        expect(edits!.length).toBe(name === "target" ? 2 : 3);
        expect(edits!.every((edit) => doc.getText(edit.range) === name)).toBe(
          true,
        );
        const renamed = TextDocument.applyEdits(doc, edits!);
        expect(renamed).toBe(source.replaceAll(name, "Renamed"));
        expect(() => new Parser(renamed, "renamed.bpl").parse()).not.toThrow();
      });
    });
  }
}
