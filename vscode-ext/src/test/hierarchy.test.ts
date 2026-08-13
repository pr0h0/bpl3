import { describe, expect, it } from "bun:test";
import * as path from "path";
import { pathToFileURL } from "url";
import { SymbolKind } from "vscode-languageserver/node";
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

  it("resolves outgoing calls from cached unsaved documents", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy outgoing.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame helper() ret int { return 1; }",
        "frame main() ret int {",
        "    return helper();",
        "}",
      ].join("\n"),
    );

    const item = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 7 },
      },
      doc,
    )![0]!;

    const outgoing = await provider.getOutgoingCalls(item);

    expect(outgoing.map((call) => call.to.name)).toEqual(["helper"]);
    expect(outgoing[0]?.to.uri).toBe(doc.uri);
  });

  it("resolves outgoing calls from methods", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy method outgoing.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame helper() ret int { return 1; }",
        "struct Runner {",
        "    frame run(this: Runner) ret int {",
        "        return helper();",
        "    }",
        "}",
      ].join("\n"),
    );

    const item = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 2, character: 11 },
      },
      doc,
    )![0]!;

    const outgoing = await provider.getOutgoingCalls(item);

    expect(outgoing.map((call) => call.to.name)).toEqual(["helper"]);
  });

  it("resolves outgoing calls from enum methods", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy enum method outgoing.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame helper() ret int { return 1; }",
        "enum Color {",
        "    Red,",
        "    frame to_code(this: Color) ret int {",
        "        return helper();",
        "    }",
        "}",
      ].join("\n"),
    );

    const item = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 3, character: 11 },
      },
      doc,
    )![0]!;

    const outgoing = await provider.getOutgoingCalls(item);

    expect(outgoing.map((call) => call.to.name)).toEqual(["helper"]);
  });

  it("resolves outgoing calls inside ternary expressions", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy ternary outgoing.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame first() ret int { return 1; }",
        "frame second() ret int { return 2; }",
        "frame choose(flag: bool) ret int {",
        "    return flag ? first() : second();",
        "}",
      ].join("\n"),
    );

    const item = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 2, character: 7 },
      },
      doc,
    )![0]!;

    const outgoing = await provider.getOutgoingCalls(item);

    expect(outgoing.map((call) => call.to.name)).toEqual(["first", "second"]);
  });

  it("prepares call hierarchy for spec methods", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy spec method.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "spec Reader {",
        "    frame read(this: *Self) ret int;",
        "}",
      ].join("\n"),
    );

    const result = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 11 },
      },
      doc,
    );

    expect(result?.[0]?.name).toBe("read");
    expect(result?.[0]?.kind).toBe(SymbolKind.Method);
  });

  it("groups repeated incoming calls from the same caller", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy incoming grouped.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame helper() ret int { return 1; }",
        "frame main() ret int {",
        "    local first: int = helper();",
        "    return first + helper();",
        "}",
      ].join("\n"),
    );

    const helper = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 7 },
      },
      doc,
    )![0]!;

    const incoming = await provider.getIncomingCalls(helper);

    expect(incoming.map((call) => call.from.name)).toEqual(["main"]);
    expect(incoming[0]?.fromRanges).toHaveLength(2);
  });

  it("finds incoming calls from methods", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy method incoming.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame helper() ret int { return 1; }",
        "struct Runner {",
        "    frame run(this: Runner) ret int {",
        "        return helper();",
        "    }",
        "}",
      ].join("\n"),
    );

    const helper = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 7 },
      },
      doc,
    )![0]!;

    const incoming = await provider.getIncomingCalls(helper);

    expect(incoming.map((call) => call.from.name)).toEqual(["run"]);
  });

  it("finds incoming calls from enum methods", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy enum method incoming.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame helper() ret int { return 1; }",
        "enum Color {",
        "    Red,",
        "    frame to_code(this: Color) ret int {",
        "        return helper();",
        "    }",
        "}",
      ].join("\n"),
    );

    const helper = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 7 },
      },
      doc,
    )![0]!;

    const incoming = await provider.getIncomingCalls(helper);

    expect(incoming.map((call) => call.from.name)).toEqual(["to_code"]);
  });

  it("finds incoming calls inside ternary expressions", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy ternary incoming.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "frame helper() ret int { return 1; }",
        "frame choose(flag: bool) ret int {",
        "    return flag ? helper() : helper();",
        "}",
      ].join("\n"),
    );

    const helper = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 7 },
      },
      doc,
    )![0]!;

    const incoming = await provider.getIncomingCalls(helper);

    expect(incoming.map((call) => call.from.name)).toEqual(["choose"]);
    expect(incoming[0]?.fromRanges).toHaveLength(2);
  });

  it("finds incoming member calls to spec methods", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new CallHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/call hierarchy spec method incoming.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "spec Reader {",
        "    frame read(this: *Self) ret int;",
        "}",
        "struct Runner {",
        "    frame run(this: Runner, reader: *Reader) ret int {",
        "        return reader.read();",
        "    }",
        "}",
      ].join("\n"),
    );

    const read = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 11 },
      },
      doc,
    )![0]!;

    const incoming = await provider.getIncomingCalls(read);

    expect(incoming.map((call) => call.from.name)).toEqual(["run"]);
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

  it("prepares type hierarchy for spec declarations", () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new TypeHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/type hierarchy spec.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      "spec Reader { frame read(this: *Self) ret int; }",
    );

    const result = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 7 },
      },
      doc,
    );

    expect(result?.[0]?.name).toBe("Reader");
    expect(result?.[0]?.kind).toBe(SymbolKind.Interface);
    expect(result?.[0]?.detail).toBe("spec");
  });

  it("resolves type hierarchy through spec extensions and implementations", async () => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new TypeHierarchyProvider(astResolver, symbolIndex);
    const filePath = path.resolve(
      __dirname,
      "../../../tmp/type hierarchy spec cached.bpl",
    );
    const doc = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      [
        "spec Reader { frame read(this: *Self) ret int; }",
        "spec ReadWriter: Reader { frame write(this: *Self, value: int) ret void; }",
        "struct FileReader : Reader {",
        "    frame read(this: *FileReader) ret int { return 0; }",
        "}",
      ].join("\n"),
    );

    const reader = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: 7 },
      },
      doc,
    )![0]!;
    const readWriter = provider.prepare(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 7 },
      },
      doc,
    )![0]!;

    const supertypes = await provider.getSupertypes(readWriter);
    const subtypes = await provider.getSubtypes(reader);

    expect(supertypes.map((item) => item.name)).toEqual(["Reader"]);
    expect(subtypes.map((item) => item.name)).toEqual([
      "ReadWriter",
      "FileReader",
    ]);
  });
});
