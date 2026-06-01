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
export { processFile, processFileAsync, processCode } from "./CompilationRunner";
export { watchMode } from "./Watcher";
export {
  CLI_JSON_ERROR_CODE_LISTS,
  CLI_JSON_ERROR_CODES,
  type CliJsonErrorCodeList,
} from "./JsonErrorCodes";

// Completions
export { getBashCompletionScript, getZshCompletionScript } from "./completions";

// Commands
export * from "./commands";
