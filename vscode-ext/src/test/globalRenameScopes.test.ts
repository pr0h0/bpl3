import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolve } from "path";
import { Parser } from "../../../compiler/frontend/Parser";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

const cases = [
  ["function parameters", "frame run(target: int) ret int { return target; }"],
  [
    "local declarations",
    "frame run() ret int { local target: int = 2; return target; }",
  ],
  [
    "lambda parameters",
    "frame run() { local f: Lambda<int>(int) = |target: int| ret int { return target; }; }",
  ],
  [
    "catch variables",
    "frame run() { try { throw 2; } catch (target: int) { target; } }",
  ],
  [
    "match bindings",
    "frame run() { match (2) { target if target > 0 => target, _ => 0, }; }",
  ],
  [
    "member names",
    "struct Item { target: int, } frame run(item: Item) ret int { return item.target; }",
  ],
  [
    "struct labels",
    "struct Item { target: int, } frame run() { local item: Item = Item { target: 2 }; }",
  ],
  ["unrelated methods", "struct Item { frame target() ret int { return 2; } }"],
];
for (const newline of ["\n", "\r\n", "\r"]) {
  for (const declaration of [
    "global target: int = 1;",
    "frame target() ret int { return 1; }",
    "extern target() ret int;",
  ]) {
    for (const [label, untouched] of cases) {
      const main = declaration.startsWith("global")
        ? "frame main() ret int { return target; }"
        : "frame main() ret int { return target(); }";
      test(`global rename preserves ${label} for ${declaration} with ${JSON.stringify(newline)}`, () => {
        const source = [declaration, untouched!, main].join(newline);
        expect(() => new Parser(source, "scopes.bpl").parse()).not.toThrow();
        const doc = TextDocument.create(
          "file:///tmp/bpl-global-rename-scopes.bpl",
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
        expect(TextDocument.applyEdits(doc, edits!)).toBe(
          [
            declaration.replace("target", "updated"),
            untouched!,
            main.replace("target", "updated"),
          ].join(newline),
        );
      });
    }
  }
}

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`global references survive initializer and scope boundaries with ${JSON.stringify(newline)}`, () => {
    const source = [
      "global target: int = 1;",
      "export target;",
      "frame run() ret int {",
      "    target;",
      "    { local target: int = target + 1; target; }",
      "    loop (local target: int = target; target < 2; target = target + 1) { target; }",
      "    local (target: int, other: int) = (target, 2);",
      "    return target;",
      "}",
      "frame main() ret int { return target; }",
    ].join(newline);
    expect(() => new Parser(source, "scopes.bpl").parse()).not.toThrow();
    const doc = TextDocument.create(
      "file:///tmp/bpl-global-scope-boundaries.bpl",
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
    expect(edits).toHaveLength(7);
    const expected = [
      "global updated: int = 1;",
      "export updated;",
      "frame run() ret int {",
      "    updated;",
      "    { local target: int = updated + 1; target; }",
      "    loop (local target: int = updated; target < 2; target = target + 1) { target; }",
      "    local (target: int, other: int) = (updated, 2);",
      "    return target;",
      "}",
      "frame main() ret int { return updated; }",
    ].join(newline);
    expect(TextDocument.applyEdits(doc, edits!)).toBe(expected);
  });
  test(`unsupported lambda-binding rename cannot rename a global with ${JSON.stringify(newline)}`, () => {
    const source =
      "global target: int = 1;" +
      newline +
      "frame run() { local f: Lambda<int>(int) = |target: int| ret int { return target; }; }";
    const doc = TextDocument.create(
      "file:///tmp/bpl-lambda-binding-rename.bpl",
      "bpl",
      1,
      source,
    );
    const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
    const handler = new ASTRenameHandler(new ASTResolver(index), index);
    const position = doc.positionAt(source.lastIndexOf("target") + 1);
    expect(
      handler.prepareRename({ textDocument: { uri: doc.uri }, position }, doc),
    ).toBeNull();
    expect(
      handler.rename(
        { textDocument: { uri: doc.uri }, position, newName: "updated" },
        doc,
      ),
    ).toBeNull();
  });
}
