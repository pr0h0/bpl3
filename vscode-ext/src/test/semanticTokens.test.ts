import { describe, expect, it } from "bun:test";
import * as path from "path";
import { ASTResolver } from "../services/ASTResolver";
import {
  SemanticTokenProvider,
  SemanticTokenType,
} from "../services/SemanticTokenProvider";
import { SymbolIndex } from "../services/SymbolIndex";

describe("Semantic Token Provider", () => {
  it("uses live document content for unsaved files", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new SemanticTokenProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/unsaved-semantic-tokens.bpl",
    );

    const result = provider.provideSemanticTokens(
      filePath,
      "frame main() ret int { return 0; }",
    );

    expect(result).not.toBeNull();
    expect(Array.from(result?.data ?? [])).toContain(SemanticTokenType.function);
  });
});
