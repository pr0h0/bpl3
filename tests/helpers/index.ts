/**
 * Test Helpers Index
 *
 * Re-exports all test helper utilities for easy importing.
 *
 * @example
 * ```typescript
 * import { compileAndRun, parseSource, createTestDocument } from "./helpers";
 * ```
 */

export {
  compileAndRun,
  compileAndRunFull,
  compileOnly,
  compilesSuccessfully,
  getCompilationErrors,
  type CompileAndRunOptions,
  type CompileAndRunResult,
} from "./compileAndRun";

export { compileToLLVM, countMatches } from "./compileToLLVM";
export {
  expectCleanCompilationFailure,
  expectSameBehaviorAtO0AndO3,
  expectValidLlvmAtOptimizations,
  runBplAtOptimization,
} from "./compilerCorrectness";

export { parseSource, parseExpression, parseStatement } from "./parser";

export {
  createTestDocument,
  createMockConnection,
  type MockDocument,
} from "./lsp";
