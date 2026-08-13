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
});
