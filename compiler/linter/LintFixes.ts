import type * as AST from "../common/AST";
import { Formatter } from "../formatter/Formatter";
import { findUnusedImports } from "./Linter";

/** Offset in `source` of a 1-based line and UTF-16 column. */
function offsetOf(source: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = source.slice(offset).search(/\r\n|\r|\n/);
    if (next < 0) return source.length;
    offset += next + (source.startsWith("\r\n", offset + next) ? 2 : 1);
  }
  return offset + column - 1;
}

/** The import as the formatter writes it, without a trailing newline. */
function renderImport(statement: AST.ImportStmt): string {
  const program = {
    kind: "Program",
    statements: [statement],
    location: statement.location,
  } as unknown as AST.Program;
  return new Formatter().format(program).trimEnd();
}

/**
 * `source` with unused imports (lint rule L002) removed: an import whose
 * names are all unused is deleted together with its line when nothing else
 * is on it, and one with some unused names is rewritten without them.
 * Returns undefined when there is nothing to remove.
 */
export function fixUnusedImports(
  program: AST.Program,
  source: string,
): string | undefined {
  const unused = findUnusedImports(program, source);
  if (unused.length === 0) return undefined;
  // Edit from the end so earlier offsets stay valid.
  const edits = unused
    .map(({ statement, names }) => {
      const location = statement.location;
      let start = offsetOf(source, location.startLine, location.startColumn);
      let end = offsetOf(source, location.endLine, location.endColumn);
      const remaining = statement.namespace
        ? []
        : statement.items.filter(
            (item) => !names.includes(item.alias ?? item.name),
          );
      if (remaining.length > 0) {
        return {
          start,
          end,
          text: renderImport({ ...statement, items: remaining }),
        };
      }
      // Delete the whole line when the import is alone on it.
      const lineStart = source.lastIndexOf("\n", start - 1) + 1;
      const before = source.slice(lineStart, start);
      const newline = source.slice(end).match(/^[ \t]*(\r\n|\r|\n|$)/);
      if (before.trim() === "" && newline) {
        start = lineStart;
        end += newline[0].length;
      }
      return { start, end, text: "" };
    })
    .sort((a, b) => b.start - a.start);
  let fixed = source;
  for (const edit of edits) {
    fixed = fixed.slice(0, edit.start) + edit.text + fixed.slice(edit.end);
  }
  return fixed;
}
