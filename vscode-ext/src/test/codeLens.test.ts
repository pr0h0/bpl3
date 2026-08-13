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

  it("provides code lenses for enum methods", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CodeLensProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/code-lens-enum-method.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "enum Color {",
        "    Red,",
        "    frame to_code(this: Color) ret int {",
        "        return 1;",
        "    }",
        "}",
      ].join("\n"),
    );

    const lenses = provider.provide({ textDocument: { uri: doc.uri } }, doc);

    expect(
      lenses.some(
        (lens) =>
          lens.range.start.line === 2 &&
          lens.command?.title === "0 references",
      ),
    ).toBe(true);
  });

  it("counts spec extensions and implementations", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CodeLensProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/code-lens-spec.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "spec Reader {",
        "    frame read(this: *Self) ret int;",
        "}",
        "spec ReadWriter: Reader {",
        "    frame write(this: *Self, value: int) ret void;",
        "}",
        "struct FileReader : Reader {",
        "    frame read(this: *FileReader) ret int { return 0; }",
        "}",
      ].join("\n"),
    );

    const lenses = provider.provide({ textDocument: { uri: doc.uri } }, doc);

    expect(lenses.some((lens) => lens.command?.title === "2 implementations"))
      .toBe(true);
  });

  it("provides code lenses for spec methods", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CodeLensProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/code-lens-spec-method.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "spec Reader {",
        "    frame read(this: *Self) ret int;",
        "}",
      ].join("\n"),
    );

    const lenses = provider.provide({ textDocument: { uri: doc.uri } }, doc);

    expect(
      lenses.some(
        (lens) =>
          lens.range.start.line === 1 &&
          lens.command?.title === "0 references",
      ),
    ).toBe(true);
  });
});
