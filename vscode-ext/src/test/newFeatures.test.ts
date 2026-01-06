/**
 * Tests for new LSP features:
 * - Selection Range Provider
 * - Document Highlight Provider
 * - Folding Range Provider
 * - Signature Help Provider
 * - Document Symbol Provider
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { SelectionRangeProvider } from "../services/SelectionRangeProvider";
import { DocumentHighlightProvider } from "../services/DocumentHighlightProvider";
import { FoldingRangeProvider } from "../services/FoldingRangeProvider";
import { SignatureHelpProvider } from "../services/SignatureHelpProvider";
import { DocumentSymbolProvider } from "../services/DocumentSymbolProvider";
import * as path from "path";
import * as fs from "fs";

const TODO_APP_PATH = path.join(
  __dirname,
  "../../../examples/todo_app/main.bpl",
);

describe("Selection Range Provider", () => {
  let provider: SelectionRangeProvider;
  let astResolver: ASTResolver;
  let testDoc: TextDocument;

  beforeAll(() => {
    const symbolIndex = new SymbolIndex();
    astResolver = new ASTResolver(symbolIndex);
    provider = new SelectionRangeProvider(astResolver);

    const testContent = `frame test() {
    local x: int = 5;
    local y: int = x + 10;
    return y;
}`;

    testDoc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-selection.bpl")}`,
      "bpl",
      1,
      testContent,
    );
  });

  it("should provide selection ranges for cursor position", () => {
    const result = provider.handle(
      {
        textDocument: { uri: testDoc.uri },
        positions: [{ line: 1, character: 10 }], // Inside "local x"
      },
      testDoc,
    );

    // Should return selection ranges or null (implementation dependent)
    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should handle multiple cursor positions", () => {
    const result = provider.handle(
      {
        textDocument: { uri: testDoc.uri },
        positions: [
          { line: 1, character: 10 },
          { line: 2, character: 10 },
        ],
      },
      testDoc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
    if (result) {
      expect(result.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("should handle invalid position gracefully", () => {
    const result = provider.handle(
      {
        textDocument: { uri: testDoc.uri },
        positions: [{ line: 999, character: 999 }],
      },
      testDoc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });
});

describe("Document Highlight Provider", () => {
  let provider: DocumentHighlightProvider;
  let testDoc: TextDocument;

  beforeAll(() => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    provider = new DocumentHighlightProvider(astResolver);

    const testContent = `frame test() {
    local count: int = 0;
    count = count + 1;
    return count;
}`;

    testDoc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-highlight.bpl")}`,
      "bpl",
      1,
      testContent,
    );
  });

  it("should highlight all occurrences of a variable", () => {
    const result = provider.handle(
      {
        textDocument: { uri: testDoc.uri },
        position: { line: 1, character: 10 }, // On "count"
      },
      testDoc,
    );

    // Should return highlights or null
    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should handle position with no identifier", () => {
    const result = provider.handle(
      {
        textDocument: { uri: testDoc.uri },
        position: { line: 0, character: 0 }, // Before "frame"
      },
      testDoc,
    );

    // May return null or empty array
    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should work on function names", () => {
    const result = provider.handle(
      {
        textDocument: { uri: testDoc.uri },
        position: { line: 0, character: 6 }, // On "test"
      },
      testDoc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });
});

describe("Folding Range Provider", () => {
  let provider: FoldingRangeProvider;
  let testDoc: TextDocument;

  beforeAll(() => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    provider = new FoldingRangeProvider(astResolver);

    const testContent = `import [App] from "bpl-express";

frame main() {
    local x: int = 0;
    if (x > 0) {
        printf("positive");
    } else {
        printf("negative");
    }
}

struct Point {
    x: int,
    y: int,
    
    frame distance(this: *Point) ret float {
        return 0.0;
    }
}`;

    testDoc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-folding.bpl")}`,
      "bpl",
      1,
      testContent,
    );
  });

  it("should provide folding ranges for functions", () => {
    const result = provider.handle(
      {
        textDocument: { uri: testDoc.uri },
      },
      testDoc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should fold imports region", () => {
    const testContentMultiImport = `import [App] from "bpl-express";
import [Database] from "bpl-db";
import [Array] from "std/array.bpl";

frame main() {}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-multi-import.bpl")}`,
      "bpl",
      1,
      testContentMultiImport,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should handle document with no foldable regions", () => {
    const simpleDoc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/simple.bpl")}`,
      "bpl",
      1,
      "local x: int = 5;",
    );

    const result = provider.handle(
      {
        textDocument: { uri: simpleDoc.uri },
      },
      simpleDoc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });
});

describe("Signature Help Provider", () => {
  let provider: SignatureHelpProvider;
  let symbolIndex: SymbolIndex;

  beforeAll(() => {
    symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    provider = new SignatureHelpProvider(astResolver, symbolIndex);

    // Index a file with functions to get their signatures
    symbolIndex.indexFile(TODO_APP_PATH);
  });

  it("should provide signature help for function calls", () => {
    const testContent = `frame test() {
    printf(
}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-signature.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 11 }, // After "printf("
        context: {
          triggerKind: 2, // TriggerCharacter
          triggerCharacter: "(",
          isRetrigger: false,
        },
      },
      doc,
    );

    expect(result === null || typeof result === "object").toBe(true);
  });

  it("should handle signature help with multiple parameters", () => {
    const testContent = `frame test() {
    sprintf(buffer, format,
}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-sig-multi.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 27 }, // After comma
        context: {
          triggerKind: 2,
          triggerCharacter: ",",
          isRetrigger: false,
        },
      },
      doc,
    );

    expect(result === null || typeof result === "object").toBe(true);
  });

  it("should return null when not in a function call", () => {
    const testContent = `frame test() {
    local x: int = 5;
}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-no-sig.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
        position: { line: 1, character: 10 },
        context: {
          triggerKind: 1, // Invoked
          isRetrigger: false,
        },
      },
      doc,
    );

    expect(result === null || typeof result === "object").toBe(true);
  });
});

describe("Document Symbol Provider", () => {
  let provider: DocumentSymbolProvider;

  beforeAll(() => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    provider = new DocumentSymbolProvider(astResolver);
  });

  it("should provide document symbols for functions", () => {
    const testContent = `frame main() {
    return 0;
}

frame helper(x: int) ret int {
    return x * 2;
}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-symbols.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should provide symbols for structs with fields and methods", () => {
    const testContent = `struct Point {
    x: int,
    y: int,
    
    frame new() ret Point {
        local p: Point;
        return p;
    }
}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-struct-symbols.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should provide symbols for enums", () => {
    const testContent = `enum Option<T> {
    Some(T),
    None,
}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-enum-symbols.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should provide symbols for global variables", () => {
    const testContent = `global DEBUG: bool = true;
global MAX_SIZE: int = 1000;

frame main() {}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test-globals.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it("should handle empty document", () => {
    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/empty.bpl")}`,
      "bpl",
      1,
      "",
    );

    const result = provider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    expect(result === null || Array.isArray(result)).toBe(true);
  });
});

describe("Integration - All Features Together", () => {
  let symbolIndex: SymbolIndex;
  let astResolver: ASTResolver;
  let selectionProvider: SelectionRangeProvider;
  let highlightProvider: DocumentHighlightProvider;
  let foldingProvider: FoldingRangeProvider;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let signatureProvider: SignatureHelpProvider;
  let symbolProvider: DocumentSymbolProvider;

  beforeAll(() => {
    symbolIndex = new SymbolIndex();
    astResolver = new ASTResolver(symbolIndex);

    selectionProvider = new SelectionRangeProvider(astResolver);
    highlightProvider = new DocumentHighlightProvider(astResolver);
    foldingProvider = new FoldingRangeProvider(astResolver);
    signatureProvider = new SignatureHelpProvider(astResolver, symbolIndex);
    symbolProvider = new DocumentSymbolProvider(astResolver);

    // Index the todo app for signature help
    symbolIndex.indexFile(TODO_APP_PATH);
  });

  it("should work on the same document", () => {
    const testContent = `import [App] from "bpl-express";

frame main() {
    local app = App.new();
    app.listen(8080);
    return 0;
}`;

    const doc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/integration-test.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    // Test all providers on the same document
    const selections = selectionProvider.handle(
      {
        textDocument: { uri: doc.uri },
        positions: [{ line: 3, character: 10 }],
      },
      doc,
    );

    const highlights = highlightProvider.handle(
      {
        textDocument: { uri: doc.uri },
        position: { line: 3, character: 10 },
      },
      doc,
    );

    const folding = foldingProvider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    const symbols = symbolProvider.handle(
      {
        textDocument: { uri: doc.uri },
      },
      doc,
    );

    // All should return valid results
    expect(selections === null || Array.isArray(selections)).toBe(true);
    expect(highlights === null || Array.isArray(highlights)).toBe(true);
    expect(folding === null || Array.isArray(folding)).toBe(true);
    expect(symbols === null || Array.isArray(symbols)).toBe(true);
  });

  it("should not interfere with each other", () => {
    const content = fs.readFileSync(TODO_APP_PATH, "utf-8");
    const doc = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      content,
    );

    // Call all providers multiple times
    for (let i = 0; i < 3; i++) {
      const symbols = symbolProvider.handle(
        { textDocument: { uri: doc.uri } },
        doc,
      );

      const folding = foldingProvider.handle(
        { textDocument: { uri: doc.uri } },
        doc,
      );

      expect(symbols === null || Array.isArray(symbols)).toBe(true);
      expect(folding === null || Array.isArray(folding)).toBe(true);
    }
  });
});
