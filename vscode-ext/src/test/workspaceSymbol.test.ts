import { describe, expect, it } from "bun:test";
import * as path from "path";
import { SymbolKind } from "vscode-languageserver/node";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { WorkspaceSymbolProvider } from "../services/WorkspaceSymbolProvider";

describe("Workspace Symbol Provider", () => {
  it("searches symbols by name from the symbol index", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new WorkspaceSymbolProvider(astResolver, symbolIndex);
    const filePath = path.join(__dirname, "fixtures", "features-test.bpl");

    symbolIndex.indexFile(filePath, false);

    const results = await provider.search({ query: "Point" });

    expect(results.some((symbol) => symbol.name === "Point")).toBe(true);
  });

  it("returns indexed symbols for empty queries", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new WorkspaceSymbolProvider(astResolver, symbolIndex);
    const filePath = path.join(__dirname, "fixtures", "features-test.bpl");

    symbolIndex.indexFile(filePath, false);

    const results = await provider.search({ query: "" });

    expect(results.some((symbol) => symbol.name === "Point")).toBe(true);
  });

  it("searches cached spec symbols and methods", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new WorkspaceSymbolProvider(astResolver, symbolIndex);
    const filePath = path.join(__dirname, "fixtures", "workspace-spec.bpl");

    astResolver.parseDocumentContent(
      filePath,
      [
        "spec ReadWriter<T> {",
        "    frame write(this: *Self, value: T) ret void;",
        "}",
      ].join("\n"),
    );

    const specResults = await provider.search({ query: "ReadWriter" });
    const methodResults = await provider.search({ query: "write" });

    expect(specResults.some((symbol) => symbol.kind === SymbolKind.Interface))
      .toBe(true);
    expect(methodResults.some((symbol) => symbol.name === "ReadWriter.write"))
      .toBe(true);
  });

  it("searches cached extern symbols", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new WorkspaceSymbolProvider(astResolver, symbolIndex);
    const filePath = path.join(__dirname, "fixtures", "workspace-extern.bpl");

    astResolver.parseDocumentContent(
      filePath,
      "extern printf(fmt: string, ...) ret int;",
    );

    const results = await provider.search({ query: "printf" });

    expect(
      results.some(
        (symbol) =>
          symbol.name === "printf" && symbol.kind === SymbolKind.Function,
      ),
    ).toBe(true);
  });

  it("searches cached enum method symbols", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new WorkspaceSymbolProvider(astResolver, symbolIndex);
    const filePath = path.join(
      __dirname,
      "fixtures",
      "workspace-enum-method.bpl",
    );

    astResolver.parseDocumentContent(
      filePath,
      [
        "enum Color {",
        "    Red,",
        "    frame to_code(this: Color) ret int {",
        "        return 1;",
        "    }",
        "}",
      ].join("\n"),
    );

    const results = await provider.search({ query: "to_code" });

    expect(results.some((symbol) => symbol.name === "Color.to_code")).toBe(
      true,
    );
  });
});
