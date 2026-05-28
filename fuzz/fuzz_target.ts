import {
  runCompilerPipeline,
  type PipelineOutcome,
} from "./compilerFuzz";

/**
 * Fuzz target function.
 * Returns true if the compiler handled the input gracefully (success or expected error).
 * Returns false if the compiler crashed (unexpected exception).
 */
export function fuzzCompiler(source: string): boolean {
  return fuzzCompilerDetailed(source).crash === undefined;
}

export function fuzzCompilerDetailed(source: string): PipelineOutcome {
  const outcome = runCompilerPipeline(source, "fuzz.bpl", {
    skipImportResolution: true,
  });

  if (outcome.crash !== undefined) {
    console.error(`${outcome.stage} crash:`, outcome.message);
  }

  return outcome;
}
