/**
 * Simple focused test for bare import completion issue
 */

import { describe, it, expect } from "bun:test";
import { ASTCompletionHandler } from "../services/ASTCompletionHandler";
import { ASTResolver } from "../services/ASTResolver";
import { SymbolIndex } from "../services/SymbolIndex";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as path from "path";

describe("Bare Import Completion", () => {
  it("should complete bare imported functions like strcpy", () => {
    // Create a simple test file content
    const testContent = `import sprintf, printf, strcpy, strlen from "bpl-express";\n\nframe test() {\n    \n}`;

    const testDoc = TextDocument.create(
      `file://${path.resolve(__dirname, "../../../tmp/test.bpl")}`,
      "bpl",
      1,
      testContent,
    );

    const symbolIndex = new SymbolIndex();
    const astResolver = new ASTResolver(symbolIndex);
    const completionHandler = new ASTCompletionHandler(
      astResolver,
      symbolIndex,
    );

    // Request completions inside the function (line 4, char 4)
    const line = 4;
    const character = 4;

    console.log("[Test] Requesting completions for bare imports...");
    const completions = completionHandler.handle(
      {
        textDocument: {
          uri: `file://${path.resolve(__dirname, "../../../tmp/test.bpl")}`,
        },
        position: { line: line - 1, character },
      },
      testDoc,
    );

    const labels = completions.map((c) => c.label);
    console.log("[Test] All completions:", labels);

    // Check if bare imports are present
    const hasSprintf = labels.includes("sprintf");
    const hasPrintf = labels.includes("printf");
    const hasStrcpy = labels.includes("strcpy");
    const hasStrlen = labels.includes("strlen");

    console.log("[Test] Found functions:", {
      sprintf: hasSprintf,
      printf: hasPrintf,
      strcpy: hasStrcpy,
      strlen: hasStrlen,
    });

    // At least one should be found
    expect(hasSprintf || hasPrintf || hasStrcpy || hasStrlen).toBe(true);
  });
});
