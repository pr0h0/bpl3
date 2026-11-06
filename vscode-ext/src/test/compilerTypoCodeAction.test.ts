import { expect, test } from "bun:test";
import { Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { compilerTypoEdit } from "../services/CompilerTypoCodeAction";

test("compiler typo actions reject stale spans, missing hints and unrelated diagnostics", () => {
  const message =
    "Undefined symbol 'calcuateSum'\nHint: Did you mean 'calculateSum'?";
  for (const text of [
    '"calcuateSum"',
    "frame main() { calcuateSum(); }",
    "otherName",
  ]) {
    const document = TextDocument.create("file:///typo.bpl", "bpl", 1, text);
    const range = Range.create(
      document.positionAt(0),
      document.positionAt(text.length),
    );
    expect(compilerTypoEdit(document, { range, message })).toBeNull();
  }
  const document = TextDocument.create(
    "file:///typo.bpl",
    "bpl",
    1,
    "calcuateSum",
  );
  const range = Range.create(0, 0, 0, document.getText().length);
  for (const diagnosticMessage of [
    "Undefined symbol 'calcuateSum'\nHint: Ensure the variable is declared.",
    "Unused variable 'calcuateSum'\nHint: Did you mean 'calculateSum'?",
    "Undefined symbol 'calcuateSum'\nHint: Did you mean 'calcuateSum'?",
  ])
    expect(
      compilerTypoEdit(document, { range, message: diagnosticMessage }),
    ).toBeNull();
});
