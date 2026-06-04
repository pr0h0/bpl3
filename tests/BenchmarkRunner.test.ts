import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  buildBplVsCComparisons,
  calculateStats,
  compareBenchmarkOutputs,
  discoverBenchmarkSources,
  findBplVsCRegressions,
  formatBplVsCSummary,
} from "../benchmark/run_benchmark";
import {
  calculateCompilePhaseStats,
  generateSyntheticCompileSource,
  measureCompilePhases,
  parseCompilationBenchmarkArgs,
} from "../benchmark/measure_compilation";

describe("Benchmark runner helpers", () => {
  it("keeps compile measurement tooling import-safe with phase exports", () => {
    const source = readFileSync(
      join(process.cwd(), "benchmark", "measure_compilation.ts"),
      "utf8",
    );

    expect(source).toContain("export function generateSyntheticCompileSource");
    expect(source).toContain("export async function measureCompilePhases");
    expect(source).toContain("export function parseCompilationBenchmarkArgs");
    expect(source).toContain("if (import.meta.main)");
    expect(source).not.toContain("\nmain();");
  });

  it("documents the compile phase benchmark mode", () => {
    const readme = readFileSync(
      join(process.cwd(), "benchmark", "README.md"),
      "utf8",
    );

    expect(readme).toContain("measure_compilation.ts --mode phases");
    expect(readme).toContain("--functions 5000");
    expect(readme).toContain("tokenSignature");
    expect(readme).toContain("irHash");
  });

  it("generates configurable synthetic compile sources", () => {
    const source = generateSyntheticCompileSource(3);

    expect(source).toContain("struct Pair");
    expect(source).toContain("frame helper_0(value: int) ret int");
    expect(source).toContain("frame helper_2(value: int) ret int");
    expect(source).not.toContain("frame helper_3(value: int) ret int");
    expect(source).toContain("total = total + helper_0(0);");
  });

  it("parses compile phase benchmark CLI options", () => {
    expect(
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--functions",
        "17",
        "--rounds",
        "3",
        "--warmups",
        "1",
        "--json",
      ]),
    ).toEqual({
      mode: "phases",
      functions: 17,
      rounds: 3,
      warmups: 1,
      json: true,
    });
  });

  it("calculates compile phase stats", () => {
    expect(calculateCompilePhaseStats([9, 3, 6])).toEqual({
      medianMs: 6,
      averageMs: 6,
    });
  });

  it("measures a tiny in-process compile phase probe", async () => {
    const result = await measureCompilePhases({
      functionCount: 1,
      rounds: 1,
      warmups: 0,
    });

    expect(result.mode).toBe("phases");
    expect(result.functionCount).toBe(1);
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.tokenSignature).toHaveLength(64);
    expect(result.irHash).toHaveLength(64);
    expect(result.full.medianMs).toBeGreaterThan(0);
  });

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
