import { describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

import {
  buildBplVsCComparisons,
  calculateStats,
  compareBenchmarkOutputs,
  discoverBenchmarkSources,
  findBplVsCRegressions,
  formatBplVsCSummary,
} from "../benchmark/run_benchmark";

describe("Benchmark runner helpers", () => {
  it("calculates sorted min, median, and average timings", () => {
    const stats = calculateStats([30, 10, 20, 40]);

    expect(stats.minMs).toBe(10);
    expect(stats.medianMs).toBe(25);
    expect(stats.averageMs).toBe(25);
  });

  it("normalizes benchmark output before comparison", () => {
    expect(compareBenchmarkOutputs(" result: 42\n", "result: 42")).toBe(true);
    expect(compareBenchmarkOutputs("result: 42", "result: 41")).toBe(false);
  });

  it("discovers benchmark source stems by language", () => {
    const sources = discoverBenchmarkSources([
      "fib.bpl",
      "fib.c",
      "fib.js",
      "README.md",
      "run.sh",
    ]);

    expect(sources).toEqual({
      stem: "fib",
      bpl: "fib.bpl",
      c: "fib.c",
      javascript: "fib.js",
    });
  });

  it("keeps speed showcase benchmarks implemented across supported languages", () => {
    const benchmarks = [
      "bit_twiddle",
      "constant_numerator_division",
      "prime_sieve",
      "vector_dot_product",
    ];
    const extensions = [".bpl", ".c", ".go", ".js", ".py"];

    for (const benchmark of benchmarks) {
      const dir = join(process.cwd(), "benchmark", benchmark);
      const sources = discoverBenchmarkSources(
        extensions
          .map((extension) => {
            if (benchmark === "prime_sieve") return `sieve${extension}`;
            if (benchmark === "vector_dot_product") return `dot${extension}`;
            return `${benchmark}${extension}`;
          })
          .filter((file) => existsSync(join(dir, file))),
      );

      expect(sources.bpl).toBeDefined();
      expect(sources.c).toBeDefined();
      expect(sources.go).toBeDefined();
      expect(sources.javascript).toBeDefined();
      expect(sources.python).toBeDefined();
    }
  });

  it("summarizes BPL versus C median ratios from benchmark results", () => {
    const comparisons = buildBplVsCComparisons([
      {
        benchmark: "fast",
        language: "BPL (-O3)",
        status: "ok",
        medianMs: 95,
      },
      {
        benchmark: "fast",
        language: "C (clang -O3)",
        status: "ok",
        medianMs: 100,
      },
      {
        benchmark: "slow",
        language: "BPL (-O3)",
        status: "ok",
        medianMs: 110,
      },
      {
        benchmark: "slow",
        language: "C (clang -O3)",
        status: "ok",
        medianMs: 100,
      },
    ]);

    expect(comparisons).toEqual([
      {
        benchmark: "slow",
        bplMedianMs: 110,
        cMedianMs: 100,
        ratio: 1.1,
        percentSlower: 10,
      },
      {
        benchmark: "fast",
        bplMedianMs: 95,
        cMedianMs: 100,
        ratio: 0.95,
        percentSlower: -5,
      },
    ]);
  });

  it("formats ratio summaries and flags threshold regressions", () => {
    const comparisons = buildBplVsCComparisons([
      {
        benchmark: "ok_gap",
        language: "BPL (-O3)",
        status: "ok",
        medianMs: 104,
      },
      {
        benchmark: "ok_gap",
        language: "C (clang -O3)",
        status: "ok",
        medianMs: 100,
      },
      {
        benchmark: "bad_gap",
        language: "BPL (-O3)",
        status: "ok",
        medianMs: 107,
      },
      {
        benchmark: "bad_gap",
        language: "C (clang -O3)",
        status: "ok",
        medianMs: 100,
      },
    ]);

    expect(findBplVsCRegressions(comparisons, 5).map((row) => row.benchmark)).toEqual([
      "bad_gap",
    ]);
    expect(formatBplVsCSummary(comparisons, 5)).toContain(
      "bad_gap         BPL 107.00 ms  C 100.00 ms  1.07x  +7.0%  REGRESSION",
    );
  });
});
