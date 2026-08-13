import { describe, expect, it } from "bun:test";
import * as path from "path";
import { ASTResolver } from "../services/ASTResolver";
import {
  SemanticTokenModifier,
  SemanticTokenProvider,
  SemanticTokenType,
} from "../services/SemanticTokenProvider";
import { SymbolIndex } from "../services/SymbolIndex";

function decodeTokens(data: Uint32Array | number[] | undefined) {
  const raw = Array.from(data ?? []);
  const tokens: Array<{
    line: number;
    character: number;
    length: number;
    type: number;
    modifiers: number;
  }> = [];
  let line = 0;
  let character = 0;

  for (let i = 0; i < raw.length; i += 5) {
    const deltaLine = raw[i] ?? 0;
    const deltaCharacter = raw[i + 1] ?? 0;

    line += deltaLine;
    character = deltaLine === 0 ? character + deltaCharacter : deltaCharacter;
    tokens.push({
      line,
      character,
      length: raw[i + 2] ?? 0,
      type: raw[i + 3] ?? -1,
      modifiers: raw[i + 4] ?? 0,
    });
  }

  return tokens;
}

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
    const tokens = decodeTokens(result?.data);

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

  it("marks extern declaration names as functions", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new SemanticTokenProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/extern-semantic-tokens.bpl",
    );

    const result = provider.provideSemanticTokens(
      filePath,
      "extern printf(fmt: string, ...) ret int;",
    );
    const tokens = decodeTokens(result?.data);

    expect(
      tokens.some(
        (token) =>
          token.line === 0 &&
          token.character === 7 &&
          token.length === "printf".length &&
          token.type === SemanticTokenType.function,
      ),
    ).toBe(true);
  });

  it("marks spec method declaration names as functions", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new SemanticTokenProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/spec-method-semantic-tokens.bpl",
    );

    const result = provider.provideSemanticTokens(
      filePath,
      [
        "spec Reader {",
        "    frame read(this: *Self) ret int;",
        "}",
      ].join("\n"),
    );
    const tokens = decodeTokens(result?.data);

    expect(
      tokens.some(
        (token) =>
          token.line === 1 &&
          token.character === 10 &&
          token.length === "read".length &&
          token.type === SemanticTokenType.function,
      ),
    ).toBe(true);
  });

  it("marks catch variables as parameter declarations", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new SemanticTokenProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/catch-semantic-tokens.bpl",
    );

    const result = provider.provideSemanticTokens(
      filePath,
      [
        "frame test() ret int {",
        "    try {",
        "        throw 1;",
        "    } catch (err: int) {",
        "        return err;",
        "    }",
        "}",
      ].join("\n"),
    );
    const tokens = decodeTokens(result?.data);

    expect(
      tokens.some(
        (token) =>
          token.line === 3 &&
          token.character === 13 &&
          token.length === "err".length &&
          token.type === SemanticTokenType.parameter &&
          (token.modifiers & (1 << SemanticTokenModifier.declaration)) !== 0,
      ),
    ).toBe(true);
  });

  it("marks enum struct pattern bindings as parameter declarations", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new SemanticTokenProvider(astResolver);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/enum-struct-pattern-semantic-tokens.bpl",
    );

    const result = provider.provideSemanticTokens(
      filePath,
      [
        "enum Packet {",
        "    Data { id: int },",
        "    Empty,",
        "}",
        "frame test(value: Packet) ret int {",
        "    return match (value) {",
        "        Packet.Data { id: packetId } => packetId,",
        "        Packet.Empty => 0,",
        "    };",
        "}",
      ].join("\n"),
    );
    const tokens = decodeTokens(result?.data);

    expect(
      tokens.some(
        (token) =>
          token.line === 6 &&
          token.character === 26 &&
          token.length === "packetId".length &&
          token.type === SemanticTokenType.parameter &&
          (token.modifiers & (1 << SemanticTokenModifier.declaration)) !== 0,
      ),
    ).toBe(true);
  });
});
