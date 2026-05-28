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
  expectCleanFailureSuite,
  expectCleanCompilationFailure,
  expectCorrectnessSuite,
  expectSeededDifferentialCorpus,
  generateSeededDifferentialPrograms,
  expectSameBehaviorAtO0AndO3,
  expectValidLlvmAtOptimizations,
  runBplAtOptimization,
  type CleanFailureCase,
  type CorrectnessProgram,
  type CorrectnessProgramResult,
  type SeededDifferentialFamily,
  type SeededDifferentialOptions,
  type SeededDifferentialProgram,
  type SeededDifferentialResult,
} from "./compilerCorrectness";

export { parseSource, parseExpression, parseStatement } from "./parser";

export {
  createTestDocument,
  createMockConnection,
  type MockDocument,
} from "./lsp";
