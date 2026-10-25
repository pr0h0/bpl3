import { Range, TextEdit, type Diagnostic } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { lexWithGrammar } from "../../../compiler/frontend/GrammarLexer";
import { TokenType } from "../../../compiler/frontend/TokenType";

/** Locate the declared name without replacing its type, initializer or comments. */
export function unusedVariableEdit(
  document: TextDocument,
  diagnostic: Diagnostic,
): TextEdit | null {
  const name =
    /\bunused variable '([A-Za-z_]\w*)'/i.exec(diagnostic.message)?.[1] ??
    /\bvariable '([A-Za-z_]\w*)' is unused/i.exec(diagnostic.message)?.[1];
  if (!name || name.startsWith("_")) return null;
  try {
    const tokens = lexWithGrammar(
      document.getText(diagnostic.range),
      document.uri,
    ).filter((token) => token.type !== TokenType.Comment);
    let index = 0;
    if (
      tokens[0]?.type === TokenType.Local ||
      tokens[0]?.type === TokenType.Global
    ) {
      index++;
      if (tokens[index]?.type === TokenType.Const) index++;
      if (tokens[index + 1]?.type !== TokenType.Colon) return null;
    } else if (tokens.length !== 2 || tokens[1]?.type !== TokenType.EOF) {
      // Identifier-only spans are safe, but a stale expression/frame span is not.
      return null;
    }
    const token = tokens[index];
    if (token?.type !== TokenType.Identifier || token.lexeme !== name)
      return null;
    const line = diagnostic.range.start.line + token.line - 1;
    const character =
      token.column -
      1 +
      (token.line === 1 ? diagnostic.range.start.character : 0);
    const range = Range.create(line, character, line, character + name.length);
    if (document.getText(range) !== name) return null;
    return TextEdit.replace(range, `_${name}`);
  } catch {
    // Incomplete source cannot support a safe token edit.
    return null;
  }
}
