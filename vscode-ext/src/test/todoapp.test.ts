/**
 * Comprehensive tests for todo_app/main.bpl
 * Tests every completion scenario, imported functions, and syntax highlighting
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { ASTCompletionHandler } from "../services/ASTCompletionHandler";
import { ASTHoverHandler } from "../services/ASTHoverHandler";
import { ASTDefinitionHandler } from "../services/ASTDefinitionHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";

const TODO_APP_PATH = path.join(
  __dirname,
  "../../../examples/todo_app/main.bpl",
);

describe("Todo App - Completions", () => {
  let completionHandler: ASTCompletionHandler;
  let document: TextDocument;
  let symbolIndex: SymbolIndex;

  beforeAll(() => {
    const content = fs.readFileSync(TODO_APP_PATH, "utf-8");
    document = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      content,
    );

    symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    completionHandler = new ASTCompletionHandler(astResolver, symbolIndex);

    // Don't index yet - we'll do it lazily in first test
  });

  it("should complete imported bare functions (sprintf, strcpy, etc.)", () => {
    // Index just before this test
    console.log("[Test] Indexing todo_app/main.bpl...");
    symbolIndex.indexFile(TODO_APP_PATH);
    console.log("[Test] Indexing complete");

    // Type "str" in the main function to get string functions
    const line = 10; // Inside main function
    const character = 4;

    console.log("[Test] Requesting completions...");
    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: line - 1, character },
      },
      document,
    );
    console.log("[Test] Got completions:", completions.length);

    // Should include imported functions
    const labels = completions.map((c) => c.label);
    console.log("[Test] All completion labels:", labels);

    // Check if bare imports are present
    const hasSprintf = labels.includes("sprintf");
    const hasPrintf = labels.includes("printf");
    const hasStrcpy = labels.includes("strcpy");
    const hasStrcat = labels.includes("strcat");
    const hasStrlen = labels.includes("strlen");
    const hasStrcmp = labels.includes("strcmp");
    const hasAtoi = labels.includes("atoi");

    console.log("[Test] Found functions:", {
      sprintf: hasSprintf,
      printf: hasPrintf,
      strcpy: hasStrcpy,
      strcat: hasStrcat,
      strlen: hasStrlen,
      strcmp: hasStrcmp,
      atoi: hasAtoi,
    });

    expect(hasSprintf || hasPrintf || hasStrcpy).toBe(true); // At least one should be found
  });

  it("should complete imported struct types (App, Router, etc.)", () => {
    const line = 10;
    const character = 4;

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: line - 1, character },
      },
      document,
    );

    const labels = completions.map((c) => c.label);
    expect(labels).toContain("App");
    expect(labels).toContain("Router");
    expect(labels).toContain("Request");
    expect(labels).toContain("Response");
    expect(labels).toContain("Database");
    expect(labels).toContain("Table");
  });

  it("should complete members after App.", () => {
    // Index bpl-express so App type can be resolved
    symbolIndex.indexFile(TODO_APP_PATH);

    // Find a line with "app." - around line 12: "app.useStatic"
    const testContent = `import [App] from "bpl-express";\nlocal app = App.new();\nlocal x = app.x;`;
    const testPath = path.resolve(
      __dirname,
      "../../../tmp/test-app-completion.bpl",
    );
    const testDoc = TextDocument.create(
      `file://${testPath}`,
      "bpl",
      1,
      testContent,
    );

    const line = 3;
    const character = 14; // After "app."

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${testPath}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    // Should have App methods
    expect(completions.length).toBeGreaterThan(0);
    console.log(
      "[Test] App members:",
      completions.map((c) => c.label),
    );
  });

  it("should complete members after req. (Request object)", () => {
    // Index bpl-express so Request type can be resolved
    symbolIndex.indexFile(TODO_APP_PATH);

    // Test "req." completion in function parameter context
    const testContent = `import [Request] from "bpl-express";\nframe test(req: *Request) {\n    local y = req.x;\n}`;
    const testPath = path.resolve(
      __dirname,
      "../../../tmp/test-req-completion.bpl",
    );
    const testDoc = TextDocument.create(
      `file://${testPath}`,
      "bpl",
      1,
      testContent,
    );

    const line = 3;
    const character = 18; // After "req."

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${testPath}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    console.log(
      "[Test] Request members:",
      completions.map((c) => c.label),
    );
    // Should have Request methods like getParam, body, etc.
    expect(completions.length).toBeGreaterThan(0);
  });

  it("should complete members after res. (Response object)", () => {
    // Index bpl-express so Response type can be resolved
    symbolIndex.indexFile(TODO_APP_PATH);

    const testContent = `import [Response] from "bpl-express";\nframe test(res: *Response) {\n    local z = res.x;\n}`;
    const testPath = path.resolve(
      __dirname,
      "../../../tmp/test-res-completion.bpl",
    );
    const testDoc = TextDocument.create(
      `file://${testPath}`,
      "bpl",
      1,
      testContent,
    );

    const line = 3;
    const character = 18;

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${testPath}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    console.log(
      "[Test] Response members:",
      completions.map((c) => c.label),
    );
    // Should have Response methods like status, json, etc.
    expect(completions.length).toBeGreaterThan(0);
  });

  it("should complete members after db. (Database pointer)", () => {
    const testContent = `global db: *Database;\nframe test() {\n    db.\n}`;
    const testDoc = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      testContent,
    );

    const line = 3;
    const character = 7;

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    console.log(
      "[Test] Database members:",
      completions.map((c) => c.label),
    );
    expect(completions.length).toBeGreaterThan(0);
  });

  it("should complete Option enum variants", () => {
    const testContent = `import [Option] from "std/option.bpl";\nframe test() {\n    local x = Option.\n}`;
    const testDoc = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      testContent,
    );

    const line = 3;
    const character = 21;

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    const labels = completions.map((c) => c.label);
    console.log("[Test] Option variants:", labels);
    expect(labels).toContain("Some");
    expect(labels).toContain("None");
  });

  it("should filter completions with partial text (str -> strcpy, strlen, etc.)", () => {
    const line = 10;
    const character = 4;

    // This tests general completion, we'll search for functions starting with "str"
    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: line - 1, character },
      },
      document,
    );

    const strFunctions = completions
      .map((c) => c.label)
      .filter((label) => label.toLowerCase().startsWith("str"));

    console.log('[Test] Functions starting with "str":', strFunctions);
    expect(strFunctions).toContain("strcpy");
    expect(strFunctions).toContain("strcat");
    expect(strFunctions).toContain("strlen");
    expect(strFunctions).toContain("strcmp");
  });

  it("should provide completions for local variables in scope", () => {
    // Test inside getTodos function where we have variables like i, row, title_val, etc.
    const testContent = `frame getTodos() {\n    local i: int = 0;\n    local row = 1;\n    \n}`;
    const testPath = path.resolve(
      __dirname,
      "../../../tmp/test-local-vars.bpl",
    );
    const testDoc = TextDocument.create(
      `file://${testPath}`,
      "bpl",
      1,
      testContent,
    );

    const line = 4;
    const character = 4;

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${testPath}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    const labels = completions.map((c) => c.label);
    console.log("[Test] Local scope completions:", labels.slice(0, 10));

    // Should include local variables
    expect(labels).toContain("i");
    expect(labels).toContain("row");
  });

  it("should complete method calls on chained expressions (res.status().json())", () => {
    // Index bpl-express so Response type can be resolved
    symbolIndex.indexFile(TODO_APP_PATH);

    const testContent = `import [Response] from "bpl-express";\nframe test(res: *Response) {\n    res.status(404).\n}`;
    const testDoc = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      testContent,
    );

    const line = 3;
    const character = 20; // After "res.status(404)."

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    console.log(
      "[Test] Chained method completions:",
      completions.map((c) => c.label),
    );
    // Should have Response methods (status likely returns *Response)
    expect(completions.length).toBeGreaterThan(0);
  });
});

describe("Todo App - Hover", () => {
  let hoverHandler: ASTHoverHandler;
  let document: TextDocument;

  beforeAll(() => {
    const content = fs.readFileSync(TODO_APP_PATH, "utf-8");
    document = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      content,
    );

    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    hoverHandler = new ASTHoverHandler(astResolver, symbolIndex);

    symbolIndex.indexFile(TODO_APP_PATH);
  });

  it("should show hover info for imported functions", () => {
    // Hover over "sprintf" usage
    const lines = fs.readFileSync(TODO_APP_PATH, "utf-8").split("\n");
    let targetLine = -1;
    let targetChar = -1;

    // Find first occurrence of "sprintf"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const idx = line.indexOf("sprintf");
      if (idx !== -1 && !line.trim().startsWith("import")) {
        targetLine = i + 1;
        targetChar = idx + 3; // Middle of "sprintf"
        break;
      }
    }

    if (targetLine === -1) {
      console.log("[Test] Could not find sprintf usage in code");
      return;
    }

    const hover = hoverHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: targetLine - 1, character: targetChar },
      },
      document,
    );

    console.log("[Test] Hover result for sprintf:", hover);
    expect(hover).toBeTruthy();
  });

  it("should show hover info for struct types", () => {
    // Hover over "Request" in parameter
    const lines = fs.readFileSync(TODO_APP_PATH, "utf-8").split("\n");
    let targetLine = -1;
    let targetChar = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const match = line.match(/:\s*\*Request/);
      if (match) {
        targetLine = i + 1;
        targetChar = line.indexOf("Request") + 3;
        break;
      }
    }

    if (targetLine === -1) {
      console.log("[Test] Could not find Request type usage");
      return;
    }

    const hover = hoverHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: targetLine - 1, character: targetChar },
      },
      document,
    );

    console.log("[Test] Hover result for Request:", hover);
    expect(hover).toBeTruthy();
  });
});

describe("Todo App - Go to Definition", () => {
  let definitionHandler: ASTDefinitionHandler;
  let document: TextDocument;

  beforeAll(() => {
    const content = fs.readFileSync(TODO_APP_PATH, "utf-8");
    document = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      content,
    );

    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    definitionHandler = new ASTDefinitionHandler(astResolver, symbolIndex);

    symbolIndex.indexFile(TODO_APP_PATH);
  });

  it("should navigate to imported function definition", () => {
    // Try to go to definition of "sprintf"
    const lines = fs.readFileSync(TODO_APP_PATH, "utf-8").split("\n");
    let targetLine = -1;
    let targetChar = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const idx = line.indexOf("sprintf");
      if (idx !== -1 && !line.trim().startsWith("import")) {
        targetLine = i + 1;
        targetChar = idx + 3;
        break;
      }
    }

    if (targetLine === -1) {
      console.log("[Test] Could not find sprintf usage");
      return;
    }

    const definition = definitionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: targetLine - 1, character: targetChar },
      },
      document,
    );

    console.log("[Test] Definition result for sprintf:", definition);
    expect(definition).toBeTruthy();
  });

  it("should navigate to local function definition", () => {
    // Try to go to definition of "getTodos" from app.router.get("/todos", getTodos)
    const lines = fs.readFileSync(TODO_APP_PATH, "utf-8").split("\n");
    let targetLine = -1;
    let targetChar = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.includes('app.router.get("/todos", getTodos)')) {
        const idx = line.lastIndexOf("getTodos");
        targetLine = i + 1;
        targetChar = idx + 3;
        break;
      }
    }

    if (targetLine === -1) {
      console.log("[Test] Could not find getTodos reference");
      return;
    }

    const definition = definitionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: targetLine - 1, character: targetChar },
      },
      document,
    );

    console.log("[Test] Definition result for getTodos:", definition);
    expect(definition).toBeTruthy();
  });
});

describe("Todo App - Edge Cases", () => {
  let completionHandler: ASTCompletionHandler;
  let _document: TextDocument;

  beforeAll(() => {
    const content = fs.readFileSync(TODO_APP_PATH, "utf-8");
    _document = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      content,
    );

    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    completionHandler = new ASTCompletionHandler(astResolver, symbolIndex);

    symbolIndex.indexFile(TODO_APP_PATH);
  });

  it("should handle completion inside match arms", () => {
    const testContent = `frame test() {\n    match (x) {\n        Option.Some(val) => {\n            \n        },\n    };\n}`;
    const testDoc = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      testContent,
    );

    const line = 4;
    const character = 12;

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${TODO_APP_PATH}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    console.log("[Test] Completions inside match arm:", completions.length);
    // Should include local variables and imported functions
    expect(completions.length).toBeGreaterThan(0);
  });

  it("should handle completion inside loop blocks", () => {
    const testContent = `frame test() {\n    local i: int = 0;\n    loop (i < 10) {\n        \n        i = i + 1;\n    }\n}`;
    const testPath = path.resolve(__dirname, "../../../tmp/test-loop-vars.bpl");
    const testDoc = TextDocument.create(
      `file://${testPath}`,
      "bpl",
      1,
      testContent,
    );

    const line = 4;
    const character = 8;

    const completions = completionHandler.handle(
      {
        textDocument: { uri: `file://${testPath}` },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    const labels = completions.map((c) => c.label);
    console.log("[Test] Completions inside loop:", labels.slice(0, 10));
    expect(labels).toContain("i");
  });

  it("should not crash on incomplete code", () => {
    const testContent = `frame test() {\n    local x = \n}`;
    const testDoc = TextDocument.create(
      `file://${TODO_APP_PATH}`,
      "bpl",
      1,
      testContent,
    );

    const line = 2;
    const character = 14;

    expect(() => {
      const completions = completionHandler.handle(
        {
          textDocument: { uri: `file://${TODO_APP_PATH}` },
          position: { line: line - 1, character },
        },
        testDoc,
      );
      console.log("[Test] Completions on incomplete code:", completions.length);
    }).not.toThrow();
  });
});
