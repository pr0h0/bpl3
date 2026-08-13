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

  it("marks type alias declaration names", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new SemanticTokenProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/type-alias-semantic-tokens.bpl",
    );

    const result = provider.provideSemanticTokens(filePath, "type Alias = int;");
    const data = Array.from(result?.data ?? []);
    const tokens: Array<{
      line: number;
      character: number;
      length: number;
      type: number;
    }> = [];
    let line = 0;
    let character = 0;

    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i] ?? 0;
      const deltaCharacter = data[i + 1] ?? 0;

      line += deltaLine;
      character =
        deltaLine === 0 ? character + deltaCharacter : deltaCharacter;
      tokens.push({
        line,
        character,
        length: data[i + 2] ?? 0,
        type: data[i + 3] ?? -1,
      });
    }

    expect(
      tokens.some(
        (token) =>
          token.line === 0 &&
          token.character === 5 &&
          token.length === "Alias".length &&
          token.type === SemanticTokenType.type,
      ),
    ).toBe(true);
  });
});
