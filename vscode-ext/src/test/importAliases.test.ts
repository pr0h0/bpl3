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

const UTIL = `struct Point {
    x: int,
}

frame add(a: int, b: int) ret int {
    return a + b;
}

frame secret() ret int {
    return 1;
}

export [Point];
export add;
`;

const REEXPORT = `import add from "./util.bpl";
export add;
`;

function setup(main: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-lsp-alias-"));
  fs.writeFileSync(path.join(dir, "util.bpl"), UTIL);
  fs.writeFileSync(path.join(dir, "reexport.bpl"), REEXPORT);
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
      // Only exported names are reachable through the namespace.
      expect(labels).not.toContain("secret");

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

  it("follows re-exports and aliased types in type positions", () => {
    const main = `import Point as P from "./util.bpl";
import add as plus from "./reexport.bpl";

frame main() ret int {
    local p: P = P { x: 1 };
    return plus(p.x, 1);
}
`;
    const { dir, symbolIndex, astResolver, document, at } = setup(main);
    try {
      const definition = new ASTDefinitionHandler(astResolver, symbolIndex);
      // `plus` reaches `add` in util.bpl through reexport.bpl.
      const call = definition.handle(at("plus(p", 1), document);
      expect(JSON.stringify(call)).toContain("util.bpl");
      // The aliased struct in a type position.
      const type = definition.handle(at("p: P", 3), document);
      expect(JSON.stringify(type)).toContain("util.bpl");
      const hover = new ASTHoverHandler(astResolver, symbolIndex).handle(
        at("p: P", 3),
        document,
      );
      expect(JSON.stringify(hover?.contents ?? "")).toContain("Point");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
