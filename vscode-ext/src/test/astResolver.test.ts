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

  it("resolves generic enum tuple pattern binding types inside match arms", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/generic-enum-pattern-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "enum Option<T> {",
        "    Some(T),",
        "    None,",
        "}",
        "frame test(value: Option<int>) ret int {",
        "    return match (value) {",
        "        Option.Some(item) => item,",
        "        Option.None => 0,",
        "    };",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "item",
      location: {
        file: filePath,
        startLine: 7,
        startColumn: 30,
        endLine: 7,
        endColumn: 34,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("resolves match pattern binding types from local scrutinees", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/local-scrutinee-pattern-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "enum Option<T> {",
        "    Some(T),",
        "    None,",
        "}",
        "frame test() ret int {",
        "    local value: Option<int> = Option<int>.Some(1);",
        "    return match (value) {",
        "        Option.Some(item) => item,",
        "        Option.None => 0,",
        "    };",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "item",
      location: {
        file: filePath,
        startLine: 8,
        startColumn: 30,
        endLine: 8,
        endColumn: 34,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("resolves enum struct pattern binding types inside match arms", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/enum-struct-pattern-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "enum Packet {",
        "    Data { id: int, label: string },",
        "    Empty,",
        "}",
        "frame test(value: Packet) ret int {",
        "    return match (value) {",
        "        Packet.Data { id: packetId, label: labelText } => packetId,",
        "        Packet.Empty => 0,",
        "    };",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "packetId",
      location: {
        file: filePath,
        startLine: 7,
        startColumn: 62,
        endLine: 7,
        endColumn: 70,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("resolves tuple pattern binding types inside match arms", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/tuple-pattern-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "frame test(pair: (int, string)) ret int {",
        "    return match (pair) {",
        "        (count, label) => count,",
        "    };",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "count",
      location: {
        file: filePath,
        startLine: 3,
        startColumn: 28,
        endLine: 3,
        endColumn: 33,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });

  it("prefers match pattern bindings over outer locals inside arms", () => {
    const symbolIndex = new SymbolIndex();
    const resolver = new ASTResolver(symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/pattern-shadow-resolve-type.bpl",
    );

    resolver.parseDocumentContent(
      filePath,
      [
        "enum Option<T> {",
        "    Some(T),",
        "    None,",
        "}",
        "frame test(value: Option<int>) ret int {",
        '    local item: string = "outer";',
        "    return match (value) {",
        "        Option.Some(item) => item,",
        "        Option.None => 0,",
        "    };",
        "}",
      ].join("\n"),
    );

    const identifier: AST.IdentifierExpr = {
      kind: "Identifier",
      name: "item",
      location: {
        file: filePath,
        startLine: 8,
        startColumn: 30,
        endLine: 8,
        endColumn: 34,
      },
    };

    expect(resolver.resolveType(identifier, filePath)).toBe("int");
  });
});
