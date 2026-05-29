import { describe, expect, it } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  DocumentLinkParams,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { ASTCompletionHandler } from "../services/ASTCompletionHandler";
import { ASTResolver } from "../services/ASTResolver";
import { DocumentLinkProvider } from "../services/DocumentLinkProvider";
import { ModuleResolver } from "../services/ModuleResolver";
import { SymbolIndex } from "../services/SymbolIndex";

const repoRoot = path.resolve(__dirname, "../../..");

describe("BPL import tooling", () => {
  it("resolves std root and std submodule imports from BPL_HOME", () => {
    const resolver = new ModuleResolver(repoRoot);

    expect(resolver.resolve("std", path.join(repoRoot, "main.bpl"))?.filePath).toBe(
      path.join(repoRoot, "lib", "std.bpl"),
    );
    expect(
      resolver.resolve("std/string", path.join(repoRoot, "main.bpl"))?.filePath,
    ).toBe(path.join(repoRoot, "lib", "string.bpl"));
  });

  it("offers standard-library module path completions inside import strings", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-imports-"));
    const filePath = path.join(tmpDir, "main.bpl");
    const content = 'import [String] from "std/';
    fs.writeFileSync(filePath, content);

    try {
      const symbolIndex = new SymbolIndex(repoRoot);
      const astResolver = new ASTResolver(symbolIndex);
      const completionHandler = new ASTCompletionHandler(
        astResolver,
        symbolIndex,
      );
      const document = TextDocument.create(
        pathToFileURL(filePath).toString(),
        "bpl",
        1,
        content,
      );
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: content.length },
      };

      const labels = completionHandler.handle(params, document).map((item) => item.label);
      expect(labels).toContain("std/string.bpl");
      expect(labels).toContain("std/array.bpl");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates accurate clickable document links for std imports", () => {
    const filePath = path.join(repoRoot, "tmp", "lsp-link-test.bpl");
    const content = 'import [String] from "std/string.bpl";\n';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);

    const symbolIndex = new SymbolIndex(repoRoot);
    const astResolver = new ASTResolver(symbolIndex);
    const provider = new DocumentLinkProvider(
      astResolver,
      symbolIndex.getResolver(),
    );
    const document = TextDocument.create(
      pathToFileURL(filePath).toString(),
      "bpl",
      1,
      content,
    );
    const params: DocumentLinkParams = {
      textDocument: { uri: document.uri },
    };

    const links = provider.provide(params, document);
    expect(links.length).toBe(1);
    expect(links[0]?.target).toBe(
      pathToFileURL(path.join(repoRoot, "lib", "string.bpl")).toString(),
    );
    expect(document.getText(links[0]?.range)).toBe("std/string.bpl");
  });
});
