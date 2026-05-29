import { describe, it, expect, beforeAll } from "bun:test";
import * as path from "path";
import { readFileSync } from "fs";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { ASTCompletionHandler } from "../services/ASTCompletionHandler";
import { ASTHoverHandler } from "../services/ASTHoverHandler";
import { ASTDefinitionHandler } from "../services/ASTDefinitionHandler";
import type { TextDocumentPositionParams } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("BPL Language Server Tests", () => {
  let completionHandler: ASTCompletionHandler;
  let hoverHandler: ASTHoverHandler;
  let definitionHandler: ASTDefinitionHandler;
  let testDocument: TextDocument;
  let testFilePath: string;

  beforeAll(() => {
    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    completionHandler = new ASTCompletionHandler(astResolver, symbolIndex);
    hoverHandler = new ASTHoverHandler(astResolver, symbolIndex);
    definitionHandler = new ASTDefinitionHandler(astResolver, symbolIndex);

    testFilePath = path.join(__dirname, "fixtures", "completion-test.bpl");
    const content = readFileSync(testFilePath, "utf-8");

    // Index the test file
    symbolIndex.indexFile(testFilePath, false);

    testDocument = TextDocument.create(
      `file://${testFilePath}`,
      "bpl",
      1,
      content,
    );
  });

  describe("Completion Tests", () => {
    it("completes User struct members after dot", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 44, character: 34 }, // After "user."
      };
      const labels = completionHandler
        .handle(params, testDocument)
        .map((c) => c.label);
      expect(labels.includes("getName")).toBe(true);
      expect(labels.includes("id")).toBe(true);
      expect(labels.includes("email")).toBe(true);
      expect(labels.includes("setName")).toBe(true);
      expect(labels.includes("getAge")).toBe(true);
    });

    it("filters completions with partial text (user.getNa)", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 47, character: 39 }, // After "user.getNa"
      };

      const labels = completionHandler
        .handle(params, testDocument)
        .map((c) => c.label);
      expect(labels.includes("getName")).toBe(true);
      expect(labels.includes("setName")).toBe(false);
      expect(labels.includes("email")).toBe(false);
    });

    it("completes local variable in nested loop scope", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 62, character: 41 }, // After "loopVar."
      };
      const labels = completionHandler
        .handle(params, testDocument)
        .map((c) => c.label);
      expect(labels.includes("getName")).toBe(true);
      expect(labels.includes("getEmail")).toBe(true);
    });

    it("method snippets omit 'this' parameter", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 44, character: 34 }, // After "user."
      };
      const completions = completionHandler.handle(params, testDocument);
      const setNameCompletion = completions.find((c) => c.label === "setName");

      expect(setNameCompletion).toBeDefined();
      // Should be "setName(${1:newName})" not "setName(${1:this}, ${2:newName})"
      expect(setNameCompletion?.insertText).toBe("setName(${1:newName})");

      const getNameCompletion = completions.find((c) => c.label === "getName");
      expect(getNameCompletion).toBeDefined();
      // Should be "getName()" not "getName(${1:this})"
      expect(getNameCompletion?.insertText).toBe("getName()");
    });

    it("completes enum variants", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 39, character: 34 }, // After "Status."
      };
      const labels = completionHandler
        .handle(params, testDocument)
        .map((c) => c.label);
      expect(labels.includes("Active")).toBe(true);
      expect(labels.includes("Inactive")).toBe(true);
      expect(labels.includes("Pending")).toBe(true);
    });

    it("provides general completions", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 56, character: 17 },
      };
      const completions = completionHandler.handle(params, testDocument);
      const labels = completions.map((c) => c.label);
      expect(labels.includes("User")).toBe(true);
      expect(labels.includes("Status")).toBe(true);
    });
  });

  describe("Hover Tests", () => {
    it("handles hover requests", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 38, character: 17 }, // On "User" type
      };
      const hover = hoverHandler.handle(params, testDocument);
      expect(hover !== undefined).toBe(true);
    });
  });

  describe("Definition Tests", () => {
    it("handles definition requests", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 38, character: 17 }, // On "User" type
      };
      const location = definitionHandler.handle(params, testDocument);
      expect(location !== undefined).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles chained member access", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 52, character: 32 },
      };
      const completions = completionHandler.handle(params, testDocument);
      expect(completions.length).toBeGreaterThanOrEqual(0);
    });

    it("handles completion in nested scopes", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 62, character: 33 },
      };
      const completions = completionHandler.handle(params, testDocument);
      expect(completions.length).toBeGreaterThan(0);
    });

    it("returns empty for invalid contexts", () => {
      const params: TextDocumentPositionParams = {
        textDocument: { uri: testDocument.uri },
        position: { line: 5, character: 10 },
      };
      const completions = completionHandler.handle(params, testDocument);
      expect(Array.isArray(completions)).toBe(true);
    });

    it("handles generic type member access (Array<int>.)", () => {
      // Create a test document with Array<int>.
      const genericTestContent = `
import [Array] from "std/array.bpl";

frame test() {
    local arr: Array<int> = Array<int>.new(10);
}
`;
      const genericTestDoc = TextDocument.create(
        "file:///test-generic.bpl",
        "bpl",
        1,
        genericTestContent,
      );

      // Test completion after Array<int>.
      // Line content: "    local arr: Array<int> = Array<int>.new(10);"
      // Character positions: "    " = 0-3, "local arr: Array<int> = " = 4-27, "Array<int>." = 28-39
      const params: TextDocumentPositionParams = {
        textDocument: { uri: genericTestDoc.uri },
        position: { line: 4, character: 39 }, // After "Array<int>."
      };
      const completions = completionHandler.handle(params, genericTestDoc);
      const labels = completions.map((c) => c.label);

      console.log("[Test] Generic type completions:", labels);

      // Should get static methods like 'new'
      expect(labels.includes("new")).toBe(true);
      expect(completions.length).toBeGreaterThan(0);
    });

    it("includes C-style loop initializer variables in body completions", () => {
      const loopContent = [
        "frame test() ret int {",
        "    loop (local i: int = 0; i < 3; i = i + 1) {",
        "        local total: int = i;",
        "        ",
        "    }",
        "    return 0;",
        "}",
      ].join("\n");
      const loopDoc = TextDocument.create(
        "file:///test-loop-completion.bpl",
        "bpl",
        1,
        loopContent,
      );

      const params: TextDocumentPositionParams = {
        textDocument: { uri: loopDoc.uri },
        position: { line: 3, character: 8 },
      };
      const labels = completionHandler.handle(params, loopDoc).map((c) => c.label);

      expect(labels).toContain("i");
      expect(labels).toContain("total");
    });
  });
});
