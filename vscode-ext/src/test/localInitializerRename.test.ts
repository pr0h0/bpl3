import { expect, test } from "bun:test";
import { resolve } from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

const fixtures = [
  [
    "block",
    "{ local target: int = target + 1; target; }",
    "{ local updated: int = target + 1; updated; }",
    "{ local target: int = updated + 1; target; }",
  ],
  [
    "loop",
    "loop (local target: int = target + 1; target < 5; target = target + 1) { target; }",
    "loop (local updated: int = target + 1; updated < 5; updated = updated + 1) { updated; }",
    "loop (local target: int = updated + 1; target < 5; target = target + 1) { target; }",
  ],
  [
    "multiline initializer",
    "{ local target: int =\n target + 1; target; }",
    "{ local updated: int =\n target + 1; updated; }",
    "{ local target: int =\n updated + 1; target; }",
  ],
] as const;

for (const binding of ["global", "parameter", "local"]) {
  for (const minified of [false, true]) {
    for (const newline of ["\n", "\r\n", "\r"]) {
      for (const [label, fragment, localExpected, globalExpected] of fixtures) {
        for (const fromInitializer of [false, true]) {
          test(`local rename excludes its initializer: ${label} ${fromInitializer} minified=${minified} outer=${binding} ${JSON.stringify(newline)}`, () => {
            const program = (body: string, outer = "target") => {
              let prefix = `frame main() ret int {\nlocal ${outer}: int = 3;`;
              if (binding === "global") {
                prefix = `global ${outer}: int = 3;\nframe main() ret int {`;
              } else if (binding === "parameter") {
                prefix = `frame main(${outer}: int) ret int {`;
              }
              return `${prefix}\n${body}\nreturn ${outer};\n}`.replaceAll(
                "\n",
                minified ? " " : newline,
              );
            };
            const source = program(fragment);
            const doc = TextDocument.create(
              "file:///tmp/bpl-initializer-rename.bpl",
              "bpl",
              1,
              source,
            );
            const index = new SymbolIndex(resolve(import.meta.dir, "../../.."));
            const handler = new ASTRenameHandler(new ASTResolver(index), index);
            const fragmentSource = fragment.replaceAll(
              "\n",
              minified ? " " : newline,
            );
            const declaration =
              source.indexOf(fragmentSource) +
              fragmentSource.indexOf("local target") +
              "local ".length;
            const initializer = source.indexOf(
              "target",
              declaration + "target".length,
            );
            const position = doc.positionAt(
              (fromInitializer ? initializer : declaration) + 1,
            );
            const references = handler.findAllReferences(position, doc);
            const edits = handler.rename(
              { textDocument: { uri: doc.uri }, position, newName: "updated" },
              doc,
            )?.changes?.[doc.uri];
            expect(edits).toBeDefined();
            expect(references!.map((ref) => ref.range)).toEqual(
              edits!.map((edit) => edit.range),
            );
            expect(TextDocument.applyEdits(doc, edits!)).toBe(
              fromInitializer
                ? program(globalExpected, "updated")
                : program(localExpected),
            );
          });
        }
      }
    }
  }
}
