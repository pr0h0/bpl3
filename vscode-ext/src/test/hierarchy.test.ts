import { describe, expect, it } from "bun:test";
import * as path from "path";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTResolver } from "../services/ASTResolver";
import { CallHierarchyProvider } from "../services/CallHierarchyProvider";
import { SymbolIndex } from "../services/SymbolIndex";
import { TypeHierarchyProvider } from "../services/TypeHierarchyProvider";

describe("Hierarchy Providers", () => {
  it("prepares call hierarchy at LSP cursor positions", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(__dirname, "../../../tmp/call hierarchy.bpl");
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      "frame main() ret int { return 0; }",
    );

    const result = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 7 },
      },
      doc,
    );

    expect(result?.[0]?.name).toBe("main");
  });

  it("prepares type hierarchy at LSP cursor positions", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new TypeHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(__dirname, "../../../tmp/type hierarchy.bpl");
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      "struct User {}",
    );

    const result = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 8 },
      },
      doc,
    );

    expect(result?.[0]?.name).toBe("User");
  });

  it("prepares type hierarchy from inherited type references", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new TypeHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/type hierarchy inherited.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      ["struct Base { id: int, }", "struct Child : Base { name: string, }"].join(
        "\n",
      ),
    );

    const result = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 17 },
      },
      doc,
    );

    expect(result?.[0]?.name).toBe("Base");
  });

  it("resolves type hierarchy supertypes and subtypes from cached documents", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new TypeHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/type hierarchy cached.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      ["struct Base { id: int, }", "struct Child : Base { name: string, }"].join(
        "\n",
      ),
    );

    const child = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 8 },
      },
      doc,
    )![0]!;
    const base = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 8 },
      },
      doc,
    )![0]!;

    const supertypes = await provider.getSupertypes(child);
    const subtypes = await provider.getSubtypes(base);

    expect(supertypes.map((item) => item.name)).toEqual(["Base"]);
    expect(subtypes.map((item) => item.name)).toEqual(["Child"]);
  });
});
