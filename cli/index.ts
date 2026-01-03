/**
 * CLI Module Index
 * Main export point for CLI components
 */

// Types
export * from "./types";

// Utilities
export * from "./utils";

// Core components
export { diagnosticFormatter } from "./DiagnosticFormatter";
export {
  compileToBinary,
  runExecutable,
  compileBinaryAndRun,
} from "./BinaryRunner";
export { processFile, processCode } from "./CompilationRunner";
export { watchMode } from "./Watcher";

// Completions
export { getBashCompletionScript, getZshCompletionScript } from "./completions";

// Commands
export * from "./commands";
