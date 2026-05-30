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

  it("resolves package imports from nested files with compiler parity", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-packages-"));
    const originalCwd = process.cwd();
    const appDir = path.join(tmpDir, "app");
    const sourceDir = path.join(appDir, "src", "features");
    const localPackageDir = path.join(appDir, "bpl_modules", "package-math");
    const localSubpathDir = path.join(localPackageDir, "features", "math");
    const workspacePackageDir = path.join(appDir, "packages", "workspace-tools");
    const unrelatedDir = path.join(tmpDir, "unrelated");
    const shadowPackageDir = path.join(
      unrelatedDir,
      "bpl_modules",
      "package-math",
    );

    try {
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(localSubpathDir, { recursive: true });
      fs.mkdirSync(workspacePackageDir, { recursive: true });
      fs.mkdirSync(shadowPackageDir, { recursive: true });

      writePackage(localPackageDir, "package-math", "index.bpl");
      fs.writeFileSync(
        path.join(localPackageDir, "index.bpl"),
        "export localAdd;\n",
      );
      fs.writeFileSync(
        path.join(localSubpathDir, "index.bpl"),
        "export subpathAdd;\n",
      );

      writePackage(workspacePackageDir, "workspace-tools", "index.bpl");
      fs.writeFileSync(
        path.join(workspacePackageDir, "index.bpl"),
        "export workspaceAdd;\n",
      );

      writePackage(shadowPackageDir, "package-math", "index.bpl");
      fs.writeFileSync(
        path.join(shadowPackageDir, "index.bpl"),
        "export wrongAdd;\n",
      );

      const mainPath = path.join(sourceDir, "main.bpl");
      fs.writeFileSync(
        mainPath,
        [
          'import localAdd from "package-math";',
          'import subpathAdd from "package-math/features/math";',
          'import workspaceAdd from "workspace-tools";',
          "",
        ].join("\n"),
      );

      process.chdir(unrelatedDir);
      const resolver = new ModuleResolver(repoRoot);

      expect(resolver.resolve("package-math", mainPath)?.filePath).toBe(
        path.join(localPackageDir, "index.bpl"),
      );
      expect(
        resolver.resolve("package-math/features/math", mainPath)?.filePath,
      ).toBe(path.join(localSubpathDir, "index.bpl"));
      expect(resolver.resolve("workspace-tools", mainPath)?.filePath).toBe(
        path.join(workspacePackageDir, "index.bpl"),
      );
      expect(resolver.resolve("package-math", mainPath)?.filePath).not.toBe(
        path.join(shadowPackageDir, "index.bpl"),
      );
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates clickable document links for package subpath imports", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-links-"));
    const appDir = path.join(tmpDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(
      appDir,
      "bpl_modules",
      "package-links",
      "features",
    );

    try {
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(packageDir, { recursive: true });
      writePackage(
        path.join(appDir, "bpl_modules", "package-links"),
        "package-links",
        "index.bpl",
      );
      fs.writeFileSync(
        path.join(appDir, "bpl_modules", "package-links", "index.bpl"),
        "export root;",
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export feature;");

      const filePath = path.join(sourceDir, "main.bpl");
      const content = 'import feature from "package-links/features";\n';
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

      const links = provider.provide(
        { textDocument: { uri: document.uri } },
        document,
      );

      expect(links.length).toBe(1);
      expect(links[0]?.target).toBe(
        pathToFileURL(path.join(packageDir, "index.bpl")).toString(),
      );
      expect(document.getText(links[0]?.range)).toBe("package-links/features");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps SymbolIndex trace logs opt-in", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-logs-"));
    const mainPath = path.join(tmpDir, "main.bpl");
    const mathPath = path.join(tmpDir, "math.bpl");
    const originalDebug = process.env.BPL_LSP_DEBUG;
    const originalLog = console.log;

    fs.writeFileSync(mathPath, "frame add() ret i32 { return 1; }\n");
    fs.writeFileSync(
      mainPath,
      ['import add from "./math.bpl";', "frame main() { add(); }", ""].join(
        "\n",
      ),
    );

    try {
      const logs: string[] = [];
      delete process.env.BPL_LSP_DEBUG;
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };

      const quietIndex = new SymbolIndex(repoRoot);
      quietIndex.indexFile(mainPath);
      quietIndex.findSymbol("missingSymbol");
      expect(logs).toHaveLength(0);

      const debugLogs: string[] = [];
      process.env.BPL_LSP_DEBUG = "1";
      console.log = (...args: unknown[]) => {
        debugLogs.push(args.map(String).join(" "));
      };

      const noisyIndex = new SymbolIndex(repoRoot);
      noisyIndex.indexFile(mainPath);
      expect(debugLogs.some((line) => line.includes("[SymbolIndex]"))).toBe(
        true,
      );
    } finally {
      if (originalDebug === undefined) {
        delete process.env.BPL_LSP_DEBUG;
      } else {
        process.env.BPL_LSP_DEBUG = originalDebug;
      }
      console.log = originalLog;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

function writePackage(
  packageDir: string,
  name: string,
  main: string,
): void {
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "bpl.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        main,
      },
      null,
      2,
    ),
  );
}
