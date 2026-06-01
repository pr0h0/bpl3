import { describe, expect, it } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { DiagnosticsProvider } from "../services/DiagnosticsProvider";
import { SymbolIndex } from "../services/SymbolIndex";

const repoRoot = path.resolve(__dirname, "../../..");

describe("BPL diagnostics", () => {
  it("explains explicit package source-file directory shadows", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-lsp-package-diagnostics-"),
    );
    const sourceFile = path.join(tempDir, "src", "main.bpl");
    const packageDir = path.join(tempDir, "bpl_modules", "pkg-math");
    const shadowDir = path.join(packageDir, "features", "shadow.bpl");
    const originalWarn = console.warn;
    const warnings: string[] = [];

    try {
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      };
      fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
      fs.mkdirSync(shadowDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "pkg-math",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
      fs.writeFileSync(path.join(shadowDir, "index.bpl"), "export shadow;");

      const content = [
        'import shadow from "pkg-math/features/shadow.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
        "",
      ].join("\n");
      fs.writeFileSync(sourceFile, content);

      const provider = new DiagnosticsProvider(new SymbolIndex(repoRoot));
      const document = TextDocument.create(
        pathToFileURL(sourceFile).toString(),
        "bpl",
        1,
        content,
      );

      const diagnostics = provider.validate(document, {
        bplHome: repoRoot,
        maxNumberOfProblems: 1000,
      });

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain(
        "Module not found: pkg-math/features/shadow.bpl",
      );
      expect(diagnostics[0]?.message).toContain(
        "explicit package source-file imports ending in .bpl or .x do not fall back to directory indexes",
      );
      expect(diagnostics[0]?.message).toContain(
        "Import the extensionless directory path to allow index.bpl/index.x fallback",
      );
      expect(diagnostics[0]?.message).toContain(shadowDir);
      expect(warnings).toHaveLength(0);
    } finally {
      console.warn = originalWarn;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
