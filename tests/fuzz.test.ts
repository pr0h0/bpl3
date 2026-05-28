import { describe, test, expect } from "bun:test";
import {
  createSeededRandom,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MIN_TOKENS,
  generateMutatedStructuredSources,
  generateRandomSource,
  generateStructuredValidSources,
  runCompilerPipeline,
  type FuzzStage,
} from "../fuzz/compilerFuzz";

// Configuration
// Use a smaller number for CI/regular tests, but allow override
const ITERATIONS = process.env.FUZZ_ITERATIONS
  ? parseInt(process.env.FUZZ_ITERATIONS)
  : 1000;
const FUZZ_SEED = process.env.FUZZ_SEED
  ? parseInt(process.env.FUZZ_SEED)
  : 0x5eed1234;
const MIN_TOKENS = DEFAULT_MIN_TOKENS;
const MAX_TOKENS = DEFAULT_MAX_TOKENS;

describe("Compiler Fuzzing", () => {
  test(
    "should generate structured valid programs that reach codegen",
    () => {
      const programs = generateStructuredValidSources(0xc0ffee, 12);

      expect(new Set(programs).size).toBe(programs.length);

      for (const [index, source] of programs.entries()) {
        const result = runCompilerPipeline(
          source,
          `structured_fuzzer_${index}.bpl`,
        );
        expect(result).toMatchObject({
          ok: true,
          stage: "codegen",
        });
      }
    },
    30 * 1000,
  );

  test(
    "should mutate structured programs without crashing the compiler",
    () => {
      const sources = generateMutatedStructuredSources({
        seed: 0xbad5eed,
        validSourceCount: 8,
        mutationsPerSource: 4,
      });
      const outcomes = sources.map((source, index) =>
        runCompilerPipeline(source, `mutated_fuzzer_${index}.bpl`),
      );

      expect(sources.length).toBe(32);
      expect(outcomes.every((outcome) => outcome.crash === undefined)).toBe(
        true,
      );
      expect(
        outcomes.some(
          (outcome) => !outcome.ok && outcome.expectedError === true,
        ),
      ).toBe(true);
    },
    30 * 1000,
  );

  test(
    `should handle ${ITERATIONS} random token sequences gracefully`,
    () => {
      console.log(`Starting fuzzer for ${ITERATIONS} iterations...`);
      console.log(
        `Generating ${MIN_TOKENS}-${MAX_TOKENS} tokens per iteration with seed ${FUZZ_SEED}.`,
      );

      let passed = 0;
      let caughtCompilerErrors = 0;
      let crashes = 0;
      const stageCounts: Record<FuzzStage, number> = {
        lexer: 0,
        parser: 0,
        typecheck: 0,
        codegen: 0,
      };
      const rng = createSeededRandom(FUZZ_SEED);

      const startTime = Date.now();

      for (let i = 0; i < ITERATIONS; i++) {
        if (i % 1000 === 0 && i > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(
            `Iteration ${i}/${ITERATIONS} (${((i / ITERATIONS) * 100).toFixed(1)}%) - ${elapsed.toFixed(1)}s`,
          );
        }

        const source = generateRandomSource(rng);
        const filePath = "fuzzer_test.bpl";
        const result = runCompilerPipeline(source, filePath);
        stageCounts[result.stage]++;

        if (result.ok) {
          passed++;
        } else if (result.expectedError === true) {
          caughtCompilerErrors++;
        } else {
          console.error(`\nCRASH at iteration ${i}!`);
          console.error("Stage:", result.stage);
          console.error("Source code:");
          console.error(source);
          console.error("\nError:");
          console.error(result.message);
          crashes++;
        }
      }

      console.log("\n--- Fuzzer Results ---");
      console.log(`Total Iterations: ${ITERATIONS}`);
      console.log(`Passed (Valid Code Generated?): ${passed}`);
      console.log(`Caught Expected Errors: ${caughtCompilerErrors}`);
      console.log(`Crashes (Unhandled Exceptions): ${crashes}`);
      console.log(`Stage Counts: ${JSON.stringify(stageCounts)}`);

      expect(crashes).toBe(0);
    },
    10 * 60 * 1000,
  ); // Increase timeout to 10 minutes
});
