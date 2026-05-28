import { describe, expect, it } from "bun:test";

import {
  expectSeededDifferentialCorpus,
  generateSeededDifferentialPrograms,
} from "./helpers/compilerCorrectness";

const DIFFERENTIAL_SEEDS = [10, 11, 12, 13, 14, 15] as const;

describe("Compiler correctness seeded differential corpus", () => {
  it("generates stable valid programs for checked-in seeds", () => {
    const programs = generateSeededDifferentialPrograms(DIFFERENTIAL_SEEDS);

    expect(
      programs.map((program) => ({
        seed: program.seed,
        family: program.family,
        name: program.name,
      })),
    ).toEqual([
      {
        seed: 10,
        family: "arithmetic-loop",
        name: "seed 10 arithmetic-loop",
      },
      {
        seed: 11,
        family: "struct-array",
        name: "seed 11 struct-array",
      },
      {
        seed: 12,
        family: "enum-match",
        name: "seed 12 enum-match",
      },
      {
        seed: 13,
        family: "generic-branch",
        name: "seed 13 generic-branch",
      },
      {
        seed: 14,
        family: "lambda-capture",
        name: "seed 14 lambda-capture",
      },
      {
        seed: 15,
        family: "arithmetic-loop",
        name: "seed 15 arithmetic-loop",
      },
    ]);
    expect(new Set(programs.map((program) => program.source)).size).toBe(
      programs.length,
    );
    expect(
      programs.every((program) =>
        program.expectedStdout.includes(`seed=${program.seed} `),
      ),
    ).toBe(true);
  });

  it(
    "runs generated programs equivalently at O0 and O3 and validates LLVM",
    () => {
      const results = expectSeededDifferentialCorpus({
        seeds: DIFFERENTIAL_SEEDS,
        validateLlvm: true,
      });

      expect(
        results.map((result) => ({
          seed: result.seed,
          family: result.family,
          stdout: result.stdout,
        })),
      ).toEqual(
        results.map((result) => ({
          seed: result.seed,
          family: result.family,
          stdout: result.expectedStdout,
        })),
      );
    },
    120000,
  );
});
