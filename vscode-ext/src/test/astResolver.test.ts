import { describe, expect, it } from "bun:test";
import * as path from "path";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import * as AST from "../../../compiler/common/AST";

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

  it("resolves local variable types inside struct methods", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/struct-method-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "struct Runner {",
        "    frame run(this: Runner) ret int {",
        "        local count: int = 1;",
        "        return count;",
        "    }",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "count",
      location: {
        file: filePath,
        startLine: 4,
        startColumn: 16,
        endLine: 4,
        endColumn: 21,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("resolves local variable types inside enum methods", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/enum-method-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "enum Color {",
        "    Red,",
        "    frame to_code(this: Color) ret int {",
        "        local count: int = 1;",
        "        return count;",
        "    }",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "count",
      location: {
        file: filePath,
        startLine: 5,
        startColumn: 16,
        endLine: 5,
        endColumn: 21,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("resolves local variable types inside if blocks", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/if-block-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "frame test(flag: bool) ret int {",
        "    if (flag) {",
        "        local count: int = 1;",
        "        return count;",
        "    }",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "count",
      location: {
        file: filePath,
        startLine: 4,
        startColumn: 16,
        endLine: 4,
        endColumn: 21,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("resolves local variable types inside switch cases", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/switch-case-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "frame test(value: int) ret int {",
        "    switch (value) {",
        "        case 1: {",
        "            local count: int = 1;",
        "            return count;",
        "        }",
        "    }",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "count",
      location: {
        file: filePath,
        startLine: 5,
        startColumn: 20,
        endLine: 5,
        endColumn: 25,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("resolves catch variable types inside catch blocks", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/catch-variable-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
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

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "err",
      location: {
        file: filePath,
        startLine: 5,
        startColumn: 16,
        endLine: 5,
        endColumn: 19,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });
});
