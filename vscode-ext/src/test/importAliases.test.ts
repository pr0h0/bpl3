import { describe, expect, it } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { ASTCompletionHandler } from "../services/ASTCompletionHandler";
import { ASTDefinitionHandler } from "../services/ASTDefinitionHandler";
import { ASTHoverHandler } from "../services/ASTHoverHandler";
import { ASTResolver } from "../services/ASTResolver";
import { InlayHintProvider } from "../services/InlayHintProvider";
import { SignatureHelpProvider } from "../services/SignatureHelpProvider";
import { SymbolIndex } from "../services/SymbolIndex";

const repoRoot = path.resolve(__dirname, "../../..");

const UTIL = `frame add(a: int, b: int) ret int {
    return a + b;
}

export add;
`;

function setup(main: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-alias-"));
  fs.writeFileSync(path.join(dir, "util.bpl"), UTIL);
  const mainPath = path.join(dir, "main.bpl");
  fs.writeFileSync(mainPath, main);
  const symbolIndex = new SymbolIndex(repoRoot);
  const astResolver = new ASTResolver(symbolIndex);
  const document = TextDocument.create(
    pathToFileURL(mainPath).toString(),
    "bpl",
    1,
    main,
  );
  const at = (needle: string, offset = 0) => {
    const index = main.indexOf(needle) + offset;
    return {
      textDocument: { uri: document.uri },
      position: document.positionAt(index),
    };
  };
  return { dir, symbolIndex, astResolver, document, at };
}

describe("BUG-445: import aliases in the language server", () => {
  it("resolves `import add as plus`", () => {
    const main = `import add as plus from "./util.bpl";

frame main() ret int {
    return plus(1, 2);
}
`;
    const { dir, symbolIndex, astResolver, document, at } = setup(main);
    try {
      const hover = new ASTHoverHandler(astResolver, symbolIndex).handle(
        at("plus(1", 1),
        document,
      );
      expect(JSON.stringify(hover?.contents ?? "")).toContain("add");

      const definition = new ASTDefinitionHandler(
        astResolver,
        symbolIndex,
      ).handle(at("plus(1", 1), document);
      expect(JSON.stringify(definition)).toContain("util.bpl");

      const help = new SignatureHelpProvider(astResolver, symbolIndex).handle(
        at("plus(1", 5),
        document,
      );
      expect(help?.signatures[0]?.label).toContain("a: int");

      const labels = new ASTCompletionHandler(astResolver, symbolIndex)
        .handle(at("plus(1"), document)
        .map((item) => item.label);
      expect(labels).toContain("plus");
      expect(labels).not.toContain("add");

      const hints = new InlayHintProvider(astResolver, symbolIndex).handle(
        {
          textDocument: { uri: document.uri },
          range: {
            start: { line: 0, character: 0 },
            end: document.positionAt(main.length),
          },
        },
        document,
      );
      expect(hints.map((hint) => hint.label)).toEqual(["a:", "b:"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves members of `import * as U`", () => {
    const main = `import * as U from "./util.bpl";

frame main() ret int {
    return U.add(1, 2);
}
`;
    const { dir, symbolIndex, astResolver, document, at } = setup(main);
    try {
      const hover = new ASTHoverHandler(astResolver, symbolIndex).handle(
        at("add(1", 1),
        document,
      );
      expect(JSON.stringify(hover?.contents ?? "")).toContain("add");

      const definition = new ASTDefinitionHandler(
        astResolver,
        symbolIndex,
      ).handle(at("add(1", 1), document);
      expect(JSON.stringify(definition)).toContain("util.bpl");

      const help = new SignatureHelpProvider(astResolver, symbolIndex).handle(
        at("add(1", 4),
        document,
      );
      expect(help?.signatures[0]?.label).toContain("a: int");

      const labels = new ASTCompletionHandler(astResolver, symbolIndex)
        .handle(at("U.add", 2), document)
        .map((item) => item.label);
      expect(labels).toContain("add");

      const hints = new InlayHintProvider(astResolver, symbolIndex).handle(
        {
          textDocument: { uri: document.uri },
          range: {
            start: { line: 0, character: 0 },
            end: document.positionAt(main.length),
          },
        },
        document,
      );
      expect(hints.map((hint) => hint.label)).toEqual(["a:", "b:"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
