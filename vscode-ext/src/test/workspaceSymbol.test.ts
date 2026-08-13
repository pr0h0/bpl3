import { describe, expect, it } from "bun:test";
import * as path from "path";
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
});
