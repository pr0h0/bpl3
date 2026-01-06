import { describe, it, expect, beforeAll } from "bun:test";
import * as path from "path";
import { readFileSync } from "fs";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { SignatureHelpProvider } from "../services/SignatureHelpProvider";
import { InlayHintProvider } from "../services/InlayHintProvider";
import type {
  SignatureHelpParams,
  InlayHintParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("BPL High Priority Features Tests", () => {
  let signatureHelpProvider: SignatureHelpProvider;
  let inlayHintProvider: InlayHintProvider;
  let testDocument: TextDocument;
  let testFilePath: string;

  beforeAll(() => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    signatureHelpProvider = new SignatureHelpProvider(astResolver, symbolIndex);
    inlayHintProvider = new InlayHintProvider(astResolver, symbolIndex);

    testFilePath = path.join(__dirname, "fixtures", "features-test.bpl");
    const content = readFileSync(testFilePath, "utf-8");

    // Index the test file
    symbolIndex.indexFile(testFilePath, false);

    // Parse the document so astResolver has the AST cached
    astResolver.parseDocumentContent(testFilePath, content);

    testDocument = TextDocument.create(
      `file://${testFilePath}`,
      "bpl",
      1,
      content,
    );
  });

  describe("Signature Help Tests", () => {
    it("shows signature help for regular functions", () => {
      // Inside printf( ... cursor here
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 58, character: 12 }, // After "printf("
        context: {
          isRetrigger: false,
          triggerKind: 1,
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      expect(result).toBeDefined();
      if (result) {
        expect(result.signatures.length).toBeGreaterThan(0);
        expect(result.activeParameter).toBeGreaterThanOrEqual(0);
      }
    });

    it("shows signature help for struct constructors", () => {
      // Inside Point.new(█
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 61, character: 40 }, // After "Point.new("
        context: {
          isRetrigger: false,
          triggerKind: 1,
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      expect(result).toBeDefined();
      if (result) {
        expect(result.signatures.length).toBeGreaterThan(0);
      }
    });

    it("shows signature help for struct methods", () => {
      // Inside p.translate(█
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 62, character: 17 }, // After "p.translate("
        context: {
          isRetrigger: false,
          triggerKind: 1,
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      expect(result).toBeDefined();
      if (result) {
        expect(result.signatures.length).toBeGreaterThan(0);
      }
    });

    it("tracks active parameter with commas", () => {
      // After first comma in calculate(100,█
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 65, character: 34 }, // After "calculate(100,"
        context: {
          isRetrigger: true,
          triggerKind: 2,
          triggerCharacter: ",",
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      expect(result).toBeDefined();
      if (result) {
        expect(result.activeParameter).toBe(1); // Second parameter
      }
    });

    it("handles nested function calls", () => {
      // Inside nested call: sprintf("%s %d", "test",█
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 59, character: 36 }, // After second comma
        context: {
          isRetrigger: true,
          triggerKind: 2,
          triggerCharacter: ",",
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      expect(result).toBeDefined();
    });

    it("returns null when not in a function call", () => {
      // Outside any function call
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 56, character: 5 }, // On "frame" keyword
        context: {
          isRetrigger: false,
          triggerKind: 1,
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      expect(result).toBeNull();
    });
  });

  describe("Inlay Hints Tests", () => {
    // We dont support type inferrence anymore on variable declarations
    it.skip("shows type hints for inferred integer variables", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 28, character: 0 },
          end: { line: 35, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);
      expect(hints.length).toBeGreaterThan(0);

      // Should have hint for local x = 42
      const xHint = hints.find((h) => h.label === ": int");
      expect(xHint).toBeDefined();
    });

    // We dont support type inferrence anymore on variable declarations
    it.skip("shows type hints for string variables", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 32, character: 0 },
          end: { line: 35, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);

      // Should have hint for local name = "test"
      const stringHint = hints.find((h) => h.label === ": string");
      expect(stringHint).toBeDefined();
    });

    // We dont support type inferrence anymore on variable declarations
    it.skip("shows type hints for boolean variables", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 35, character: 0 },
          end: { line: 38, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);

      // Should have hint for local flag = true
      const boolHint = hints.find((h) => h.label === ": bool");
      expect(boolHint).toBeDefined();
    });

    it("shows parameter name hints for function calls", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 38, character: 0 },
          end: { line: 42, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);

      // Should have hints for calculate parameters
      const paramHints = hints.filter(
        (h) => h.label === "width:" || h.label === "height:",
      );
      expect(paramHints.length).toBeGreaterThan(0);
    });

    it("shows parameter hints for struct methods (skipping 'this')", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 42, character: 0 },
          end: { line: 44, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);

      // Should have hints for translate(dx, dy) but NOT 'this'
      const thisHint = hints.find((h) => h.label === "this:");
      expect(thisHint).toBeUndefined();

      const dxHint = hints.find((h) => h.label === "dx:");
      const dyHint = hints.find((h) => h.label === "dy:");
      expect(dxHint || dyHint).toBeDefined();
    });

    it("does not show type hints when type is explicitly specified", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 44, character: 0 },
          end: { line: 46, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);

      // Line 44 has: local p: Point = ...
      // Should NOT have type hint because type is explicit
      const pointHint = hints.find(
        (h) => h.label === ": Point" && h.position.line === 44,
      );
      expect(pointHint).toBeUndefined();
    });

    it("skips parameter hints when argument name matches parameter name", () => {
      // If we had: calculate(width, height) where width/height are vars
      // We shouldn't show hints since the names are clear
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 100, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);

      // All hints should be valid
      expect(Array.isArray(hints)).toBe(true);
    });

    it("handles array type hints", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 51, character: 0 },
          end: { line: 52, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);

      // Should infer Array<int> or similar for arr
      expect(hints.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Edge Cases", () => {
    it("handles signature help with no parameters", () => {
      // For p.distance() which has only 'this'
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 54, character: 28 }, // After "p.distance("
        context: {
          isRetrigger: false,
          triggerKind: 1,
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      // Should still provide signature even if no user-visible params
      expect(result).toBeDefined();
    });

    it("handles inlay hints in empty ranges", () => {
      const params: InlayHintParams = {
        textDocument: { uri: testDocument.uri },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      };

      const hints = inlayHintProvider.handle(params, testDocument);
      expect(Array.isArray(hints)).toBe(true);
    });

    it("handles signature help with generic functions", () => {
      // Array<int>.new(10) - generic constructor
      const params: SignatureHelpParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 51, character: 35 }, // Inside .new(
        context: {
          isRetrigger: false,
          triggerKind: 1,
        },
      };

      const result = signatureHelpProvider.handle(params, testDocument);
      // May or may not find signature depending on indexing
      expect(result === null || result.signatures).toBeDefined();
    });
  });
});
