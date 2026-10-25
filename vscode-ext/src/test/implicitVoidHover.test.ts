import { expect, test } from "bun:test";
import { resolve } from "path";
import { pathToFileURL } from "url";
import type { Hover } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ASTResolver } from "../services/ASTResolver";
import { ASTHoverHandler } from "../services/ASTHoverHandler";
import {
  SemanticTokenProvider,
  SemanticTokenType,
} from "../services/SemanticTokenProvider";
import { SymbolIndex } from "../services/SymbolIndex";

function setup(source: string) {
  const file = resolve(
    import.meta.dir,
    "../../../tmp/implicit-void-hover-unsaved.bpl",
  );
  const index = new SymbolIndex();
  const resolver = new ASTResolver(index);
  const document = TextDocument.create(
    pathToFileURL(file).toString(),
    "bpl",
    1,
    source,
  );
  resolver.parseDocumentContent(file, source);
  return { file, index, resolver, document };
}
function hoverText(hover: Hover | null): string {
  const contents = hover?.contents;
  if (contents && typeof contents === "object" && "value" in contents)
    return String(contents.value);
  throw new Error("Expected hover markup");
}
for (const newline of ["\n", "\r\n", "\r"]) {
  test(`implicit-void function name selects its declaration: ${JSON.stringify(newline)}`, () => {
    const { file, index, resolver, document } = setup(
      ["/# Runs work. #/", "frame run() {}"].join(newline),
    );
    expect(resolver.findNodeAtPosition(file, 1, 7)?.kind).toBe("FunctionDecl");
    const hover = new ASTHoverHandler(resolver, index).handle(
      {
        textDocument: { uri: document.uri },
        position: { line: 1, character: 7 },
      },
      document,
    );
    expect(hoverText(hover)).toContain("frame run(");
    expect(hoverText(hover)).toContain("Runs work.");
    expect(hoverText(hover)).not.toContain("Built-in Type `void`");
  });
  test(`implicit-void method name selects its declaration: ${JSON.stringify(newline)}`, () => {
    const { file, index, resolver, document } = setup(
      [
        "struct Runner {",
        "    /# Runs work. #/",
        "    frame run(this: *Runner) {}",
        "}",
      ].join(newline),
    );
    expect(resolver.findNodeAtPosition(file, 2, 11)?.kind).toBe("FunctionDecl");
    const hover = new ASTHoverHandler(resolver, index).handle(
      {
        textDocument: { uri: document.uri },
        position: { line: 2, character: 11 },
      },
      document,
    );
    expect(hoverText(hover)).toContain("frame run(");
    expect(hoverText(hover)).toContain("Runs work.");
  });
  test(`explicit-void annotations still provide type help: ${JSON.stringify(newline)}`, () => {
    const { file, index, resolver, document } = setup(
      ["# explicit annotation", "frame run() ret void {}"].join(newline),
    );
    expect(resolver.findNodeAtPosition(file, 1, 7)?.kind).toBe("FunctionDecl");
    expect(resolver.findNodeAtPosition(file, 1, 17)?.kind).toBe("BasicType");
    const hover = new ASTHoverHandler(resolver, index).handle(
      {
        textDocument: { uri: document.uri },
        position: { line: 1, character: 17 },
      },
      document,
    );
    expect(hoverText(hover)).toContain("Built-in Type `void`");
  });
  test(`implicit-void highlighting remains intact: ${JSON.stringify(newline)}`, () => {
    const { file, resolver, document } = setup(
      ["# ordinary declaration", "frame run() {}"].join(newline),
    );
    const tokens = new SemanticTokenProvider(resolver).provideSemanticTokens(
      file,
      document.getText(),
    );
    expect(tokens!.data).toHaveLength(5);
    expect(tokens!.data.slice(0, 4)).toEqual([
      1,
      6,
      3,
      SemanticTokenType.function,
    ]);
  });
}
