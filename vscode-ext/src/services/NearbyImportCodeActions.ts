import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  CodeActionKind,
  TextEdit,
  type CodeAction,
  type Diagnostic,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "../../../compiler/frontend/Parser";

/** Both spellings are emitted by compiler type-resolution paths. */
export function importableTypeName(diagnostic: Diagnostic): string | undefined {
  return /(?:Unknown|Undefined) type '(\w+)'/.exec(diagnostic.message)?.[1];
}

/** Suggest actual nearby exports, rather than matching comments or string data. */
export function nearbyImportCodeActions(
  document: TextDocument,
  diagnostic: Diagnostic,
  name: string,
  isType: boolean,
): CodeAction[] {
  const actions: CodeAction[] = [];
  try {
    const current = fileURLToPath(document.uri);
    const directory = path.dirname(current);
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => {
        if (a.name === b.name) return 0;
        return a.name < b.name ? -1 : 1;
      });
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !/\.(bpl|x)$/.test(entry.name) ||
        entry.name === path.basename(current)
      )
        continue;
      try {
        const file = path.join(directory, entry.name);
        const program = new Parser(fs.readFileSync(file, "utf8"), file).parse();
        if (program.errors?.length) continue;
        const exported = program.statements.some(
          (statement) =>
            statement.kind === "Export" &&
            statement.items.some(
              (item) =>
                item.name === name && item.isType === isType && !item.isWrapped,
            ),
        );
        if (!exported) continue;
        const source = `./${entry.name}`;
        // BPL supports JSON escapes except the short backspace/form-feed forms.
        const quoted = JSON.stringify(source).replace(
          /\\(?:["\\bfnrt]|u[0-9a-fA-F]{4})/g,
          (escape) => {
            if (escape === "\\b") return "\\u0008";
            if (escape === "\\f") return "\\u000c";
            return escape;
          },
        );
        actions.push({
          title: `Import ${name} from ${source}`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [document.uri]: [
                TextEdit.insert(
                  { line: 0, character: 0 },
                  `import ${isType ? `[${name}]` : name} from ${quoted};\n`,
                ),
              ],
            },
          },
        });
      } catch {
        // An incomplete or unreadable sibling must not hide other valid exports.
      }
    }
  } catch {
    // Missing directories and non-file documents have no nearby candidates.
  }
  return actions;
}
