import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import type { Hover } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CompilerError } from "../../../compiler/common/CompilerError";
import { ASTResolver } from "../services/ASTResolver";
import { ASTRenameHandler } from "../services/ASTRenameHandler";
import { ASTHoverHandler } from "../services/ASTHoverHandler";
import { HoverProvider } from "../services/HoverProvider";
import { compilerErrorToDiagnostic } from "../services/DiagnosticsProvider";
import { DocumentLinkProvider } from "../services/DocumentLinkProvider";
import {
  SemanticTokenProvider,
  SemanticTokenType,
} from "../services/SemanticTokenProvider";
import { SymbolIndex } from "../services/SymbolIndex";
import {
  getWordAtPosition,
  findEnclosingStruct,
  findVariableType,
  clampPosition,
} from "../services/utils";

const repoRoot = resolve(import.meta.dir, "../../..");
function withSource(
  source: string,
  run: (
    document: TextDocument,
    file: string,
    index: SymbolIndex,
    resolver: ASTResolver,
  ) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), "bpl-editor-eol-"));
  const file = join(dir, "main.bpl");
  writeFileSync(file, source);
  const doc = TextDocument.create(
    pathToFileURL(file).toString(),
    "bpl",
    1,
    source,
  );
  const index = new SymbolIndex(repoRoot);
  try {
    run(doc, file, index, new ASTResolver(index));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function markup(hover: Hover | null): string {
  const contents = hover?.contents;
  if (contents && typeof contents === "object" && "value" in contents)
    return String(contents.value);
  throw new Error("Expected hover markup");
}
function decodeTokens(data: number[]) {
  let line = 0,
    character = 0;
  const tokens: Array<{
    line: number;
    character: number;
    length: number;
    type: number;
  }> = [];
  for (let i = 0; i < data.length; i += 5) {
    line += data[i]!;
    character = data[i] === 0 ? character + data[i + 1]! : data[i + 1]!;
    tokens.push({ line, character, length: data[i + 2]!, type: data[i + 3]! });
  }
  return tokens;
}

for (const newline of ["\n", "\r\n", "\r"]) {
  test(`editor word and enclosing declaration utilities: ${JSON.stringify(newline)}`, () => {
    withSource(["# heading", "local sample: int = 1;"].join(newline), (doc) => {
      expect(getWordAtPosition(doc, { line: 1, character: 8 })).toBe("sample");
    });
    expect(
      findEnclosingStruct(
        ["struct First {}", "struct Second {", " value: int,", "}"].join(
          newline,
        ),
        2,
      ),
    ).toBe("Second");
    expect(
      findVariableType(
        ["frame first(value: int) {}", "frame second(value: string) {}"].join(
          newline,
        ),
        "value",
        1,
      ),
    ).toBe("string");
  });
  test(`editor positions exclude newline characters: ${JSON.stringify(newline)}`, () => {
    withSource(["abc", "xyz"].join(newline), (doc) => {
      expect(clampPosition(doc, 0, 999)).toEqual({ line: 0, character: 3 });
      expect(clampPosition(doc, 999, 999)).toEqual({ line: 1, character: 3 });
    });
  });
  test(`editor diagnostic positions: ${JSON.stringify(newline)}`, () => {
    withSource(["# heading", "    boom"].join(newline), (doc, file) => {
      const err = new CompilerError("failure", "", {
        file,
        startLine: 2,
        startColumn: 5,
        endLine: 2,
        endColumn: 9,
      });
      const diagnostic = compilerErrorToDiagnostic(err, doc);
      expect(diagnostic.range).toEqual({
        start: { line: 1, character: 4 },
        end: { line: 1, character: 8 },
      });
      expect(doc.getText(diagnostic.range)).toBe("boom");
    });
  });
  test(`editor semantic declaration ranges: ${JSON.stringify(newline)}`, () => {
    withSource(
      ["# heading", "frame helper() {}", "frame main() {}"].join(newline),
      (doc, file, _index, resolver) => {
        const result = new SemanticTokenProvider(
          resolver,
        ).provideSemanticTokens(file, doc.getText());
        expect(result).not.toBeNull();
        const functions = decodeTokens(result!.data).filter(
          (t) => t.type === SemanticTokenType.function,
        );
        expect(functions.map((t) => [t.line, t.character, t.length])).toEqual([
          [1, 6, 6],
          [2, 6, 4],
        ]);
      },
    );
  });
  test(`editor multiline import link ranges: ${JSON.stringify(newline)}`, () => {
    withSource(
      ["# heading", "import value from", '    "./dep.bpl";'].join(newline),
      (doc, file, index, resolver) => {
        writeFileSync(
          join(file, "../dep.bpl"),
          "global value: int = 1; export value;",
        );
        const links = new DocumentLinkProvider(
          resolver,
          index.getResolver(),
        ).provide({ textDocument: { uri: doc.uri } }, doc);
        expect(links).toHaveLength(1);
        expect(links[0]!.range).toEqual({
          start: { line: 2, character: 5 },
          end: { line: 2, character: 14 },
        });
        expect(doc.getText(links[0]!.range)).toBe("./dep.bpl");
      },
    );
  });
  test(`editor AST source slices preserve literal bytes: ${JSON.stringify(newline)}`, () => {
    const declaration = [
      "frame main() {",
      "    local text: string = `first",
      "",
      "second`;",
      "}",
    ].join(newline);
    withSource(
      "# heading" + newline + declaration,
      (doc, file, _index, resolver) => {
        const ast = resolver.parseDocumentContent(file, doc.getText());
        expect(ast).not.toBeNull();
        expect(resolver.getNodeText(ast!.statements[0]!, file)).toBe(
          declaration,
        );
      },
    );
  });
  test(`editor extern rename edits select only names: ${JSON.stringify(newline)}`, () => {
    withSource(
      [
        "# heading",
        "extern show(value: int);",
        "frame main() {",
        "    show(1);",
        "}",
      ].join(newline),
      (doc, _file, index, resolver) => {
        const result = new ASTRenameHandler(resolver, index).rename(
          {
            textDocument: { uri: doc.uri },
            position: { line: 1, character: 8 },
            newName: "display",
          },
          doc,
        );
        const edits = result?.changes?.[doc.uri];
        expect(edits).toHaveLength(2);
        expect(edits!.map((e) => doc.getText(e.range))).toEqual([
          "show",
          "show",
        ]);
        expect(edits!.map((e) => e.range.start)).toEqual([
          { line: 1, character: 7 },
          { line: 3, character: 4 },
        ]);
      },
    );
  });
  test(`editor hover documentation has logical line breaks: ${JSON.stringify(newline)}`, () => {
    withSource(
      [
        "/#",
        "First line.",
        "Second line.",
        "#/",
        "frame run() ret int { return 0; }",
      ].join(newline),
      (doc, file, index, resolver) => {
        const ast = resolver.parseDocumentContent(file, doc.getText());
        const declaration = ast!.statements[0]!;
        expect(declaration.kind).toBe("FunctionDecl");
        const simple = HoverProvider.createHover({
          name: "run",
          kind: "function",
          filePath: file,
          location: declaration.location,
          declaration,
          documentation: declaration.documentation,
        });
        expect(markup(simple)).toContain("First line.\nSecond line.");
        const hover = new ASTHoverHandler(resolver, index).handle(
          {
            textDocument: { uri: doc.uri },
            position: { line: 4, character: 7 },
          },
          doc,
        );
        expect(markup(hover)).toContain("First line.  \nSecond line.");
      },
    );
  });
}

test("editor source slices and declaration positions retain mixed newline payloads", () => {
  const declaration =
    "frame main() {\r    local text: string = `one\r\ntwo\nthree`;\r\n}";
  withSource("# heading\r\n" + declaration, (doc, file, _index, resolver) => {
    const ast = resolver.parseDocumentContent(file, doc.getText());
    expect(ast).not.toBeNull();
    expect(resolver.getNodeText(ast!.statements[0]!, file)).toBe(declaration);
    const result = new SemanticTokenProvider(resolver).provideSemanticTokens(
      file,
      doc.getText(),
    );
    expect(
      decodeTokens(result!.data).find(
        (token) => token.type === SemanticTokenType.function,
      ),
    ).toMatchObject({ line: 1, character: 6, length: 4 });
  });
});
