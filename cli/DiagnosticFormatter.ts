/**
 * CLI Diagnostic Formatter
 * Re-exports the DiagnosticFormatter from compiler with CLI-specific defaults
 */

import * as path from "path";
import type { CompilerError } from "../compiler/common/CompilerError";
import { DiagnosticFormatter as CompilerDiagnosticFormatter } from "../compiler/common/DiagnosticFormatter";

// Re-export the class
export { DiagnosticFormatter } from "../compiler/common/DiagnosticFormatter";

/**
 * Singleton instance for CLI usage with CLI-specific configuration
 */
export const diagnosticFormatter = new CompilerDiagnosticFormatter({
  // Diagnostics go to stderr; color only a terminal unless --color forces it.
  colorize: process.env.NO_COLOR === undefined && process.stderr.isTTY === true,
  contextLines: 3,
  showCodeSnippets: true,
});

/**
 * Warnings located in `filePath`, each once. Imported modules are checked with
 * the same checker; their warnings belong to those files, not to this one.
 */
export function warningsForFile(
  warnings: CompilerError[],
  filePath: string,
): CompilerError[] {
  const target = path.resolve(filePath);
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const file = warning.location?.file;
    if (file && path.resolve(file) !== target) return false;
    const key = `${warning.location?.startLine}:${warning.location?.startColumn}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
