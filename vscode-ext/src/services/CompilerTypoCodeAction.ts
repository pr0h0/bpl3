import { TextEdit, type Diagnostic } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

/** The compiler's suggestion comes from visible symbols, rather than raw source. */
export function compilerTypoEdit(
  document: TextDocument,
  diagnostic: Diagnostic,
): TextEdit | null {
  const missing = /^Undefined symbol '([A-Za-z_]\w*)'/.exec(
    diagnostic.message,
  )?.[1];
  const suggested = /^Hint: Did you mean '([A-Za-z_]\w*)'\?$/m.exec(
    diagnostic.message,
  )?.[1];
  if (
    !missing ||
    !suggested ||
    missing === suggested ||
    document.getText(diagnostic.range) !== missing
  )
    return null;
  return TextEdit.replace(diagnostic.range, suggested);
}
