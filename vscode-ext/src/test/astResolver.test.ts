import { describe, expect, it } from "bun:test";
import * as path from "path";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";

describe("ASTResolver", () => {
  it("returns cached source before reading from disk", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(__dirname, "../../../tmp/unsaved-source.bpl");
    const source = "frame main() ret int { return 0; }";
    const originalError = console.error;
    const errors: unknown[][] = [];

    try {
      console.error = (...args: unknown[]) => {
        errors.push(args);
      };

      resolver.parseDocumentContent(filePath, source);

      expect(resolver.getSource(filePath)).toBe(source);
      expect(errors).toHaveLength(0);
    } finally {
      console.error = originalError;
    }
  });
});
