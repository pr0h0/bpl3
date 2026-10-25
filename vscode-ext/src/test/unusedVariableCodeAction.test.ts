import { expect, test } from "bun:test";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticsProvider } from "../services/DiagnosticsProvider";
import { SymbolIndex } from "../services/SymbolIndex";
import { unusedVariableEdit } from "../services/UnusedVariableCodeAction";

for (const declaration of [
  "local unusedValue: int = 42;",
  "local const unusedValue: int = 42;",
  "local /# unusedValue is deliberately retained #/ const\r\n unusedValue: int = 42;",
]) {
  test(`unused-variable edit preserves the declaration and clears the actual diagnostic: ${declaration}`, () => {
    const uri = pathToFileURL(resolve("tmp/unused-variable-action.bpl")).href;
    const document = TextDocument.create(
      uri,
      "bpl",
      1,
      `frame main() ret int {\n  ${declaration}\n  return 0;\n}`,
    );
    const provider = new DiagnosticsProvider(new SymbolIndex());
    const diagnostic = provider
      .validate(document)
      .find((item) => item.message.includes("Unused variable 'unusedValue'"));
    expect(diagnostic).toBeDefined();
    const edit = unusedVariableEdit(document, diagnostic!);
    expect(edit).not.toBeNull();
    expect(document.getText(edit!.range)).toBe("unusedValue");
    const result = TextDocument.applyEdits(document, [edit!]);
    // The comment is retained; only the declared identifier receives a prefix.
    const declarationOffset = document.offsetAt(edit!.range.start);
    expect(result).toBe(
      document.getText().slice(0, declarationOffset) +
        "_" +
        document.getText().slice(declarationOffset),
    );
    const fixed = TextDocument.create(uri, "bpl", 2, result);
    expect(provider.validate(fixed)).toEqual([]);
  });
}

test("unused-variable edits reject stale, already suppressed and non-identifier spans", () => {
  for (const text of [
    "frame unusedValue() {}",
    '"unusedValue"',
    "local different: int = 42;",
    "local _unusedValue: int = 42;",
  ]) {
    const document = TextDocument.create("file:///unused.bpl", "bpl", 1, text);
    const diagnostic = {
      range: Range.create(
        document.positionAt(0),
        document.positionAt(text.length),
      ),
      message: "Unused variable 'unusedValue'",
    };
    expect(unusedVariableEdit(document, diagnostic)).toBeNull();
  }
});
