import { describe, expect, it } from "bun:test";
import * as path from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTResolver } from "../services/ASTResolver";
import { CodeLensProvider } from "../services/CodeLensProvider";
import { SymbolIndex } from "../services/SymbolIndex";

describe("CodeLens Provider", () => {
  it("counts struct inheritance as an implementation", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CodeLensProvider(astResolver);
    const filePath = path.resolve(__dirname, "../../../tmp/code-lens.bpl");
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      ["struct Base { x: int, }", "struct Child : Base { y: int, }"].join(
        "\n",
      ),
    );

    const lenses = provider.provide({ textDocument: { uri: doc.uri } }, doc);

    expect(lenses.some((lens) => lens.command?.title === "1 implementation"))
      .toBe(true);
  });
});
