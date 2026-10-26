import { expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileURL } from "url";
import { resolve, join } from "path";
import { ASTResolver } from "../services/ASTResolver";
import { DocumentLinkProvider } from "../services/DocumentLinkProvider";
import { SymbolIndex } from "../services/SymbolIndex";

const root = resolve(import.meta.dir, "../../..");

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`import links select source tokens across ${JSON.stringify(newline)} lines`, () => {
    const imports = [
      'import [String] from "std/string.bpl";',
      'import [String] from "std/string.bpl";',
      'import [String] from /# "std/string.bpl" #/ "std/string.bpl";',
      `import [String]${newline}from "std/\\u0073tring.bpl";`,
    ];
    const content = '/# 😀 "std/string.bpl" #/ ' + imports.join(" ");
    const uri = pathToFileURL(join(root, "tmp/link-ranges.bpl")).toString();
    const document = TextDocument.create(uri, "bpl", 1, content);
    const index = new SymbolIndex(root);
    const provider = new DocumentLinkProvider(
      new ASTResolver(index),
      index.getResolver(),
    );
    const links = provider.provide({ textDocument: { uri } }, document);
    expect(links).toHaveLength(4);
    let statementOffset = content.indexOf("import");
    for (let i = 0; i < imports.length; i++) {
      const statement = imports[i]!;
      const rawPath = i === 3 ? "std/\\u0073tring.bpl" : "std/string.bpl";
      const pathOffset =
        statementOffset + statement.lastIndexOf('"') - rawPath.length;
      expect(links[i]!.range).toEqual({
        start: document.positionAt(pathOffset),
        end: document.positionAt(pathOffset + rawPath.length),
      });
      expect(document.getText(links[i]!.range)).toBe(rawPath);
      expect(links[i]!.target).toBe(
        pathToFileURL(join(root, "lib/string.bpl")).toString(),
      );
      statementOffset += statement.length + 1;
    }
  });
}
