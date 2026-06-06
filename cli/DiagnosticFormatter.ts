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
  colorize: process.env.NO_COLOR === undefined,
  contextLines: 3,
  showCodeSnippets: true,
});
