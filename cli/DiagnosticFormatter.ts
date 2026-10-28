/**
 * CLI Diagnostic Formatter
 * Re-exports the DiagnosticFormatter from compiler with CLI-specific defaults
 */

import {
  DiagnosticFormatter as CompilerDiagnosticFormatter,
} from "../compiler/common/DiagnosticFormatter";

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
