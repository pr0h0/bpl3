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
  compareCompilePhaseBenchmarkResults,
  generateSyntheticCompileSource,
  measureCompilePhases,
  parseCompilationBenchmarkArgs,
  type CompilePhaseBenchmarkResult,
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
    expect(readme).toContain("--compare");
    expect(readme).toContain("--gate-phases");
    expect(readme).toContain("--max-full-regression");
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

  it("parses compile phase benchmark comparison options", () => {
    expect(
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--compare",
        "/tmp/baseline.json",
        "--max-phase-regression",
        "2.5",
        "--max-full-regression",
        "1",
      ]),
    ).toEqual({
      mode: "phases",
      functions: 5000,
      rounds: 31,
      warmups: 5,
      json: false,
      compare: "/tmp/baseline.json",
      maxPhaseRegressionPercent: 2.5,
      maxFullRegressionPercent: 1,
    });
  });

  it("parses compile phase benchmark gate phase options", () => {
    expect(
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--compare",
        "/tmp/baseline.json",
        "--gate-phases",
        "codegen,full",
      ]),
    ).toEqual({
      mode: "phases",
      functions: 5000,
      rounds: 31,
      warmups: 5,
      json: false,
      compare: "/tmp/baseline.json",
      gatePhases: ["codegen", "full"],
    });

    expect(() =>
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--gate-phases",
        "codegen,unknown",
      ]),
    ).toThrow("--gate-phases contains unknown phase: unknown");
  });

  it("compares compile phase benchmark medians and threshold failures", () => {
    const baseline = createPhaseBenchmarkFixture({
      full: 100,
      codegen: 40,
    });
    const candidate = createPhaseBenchmarkFixture({
      full: 104,
      codegen: 41.4,
    });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        maxPhaseRegressionPercent: 2,
        maxFullRegressionPercent: 5,
      },
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.signaturesMatch).toBe(true);
    expect(comparison.phaseDeltas.find((delta) => delta.phase === "codegen"))
      .toMatchObject({
        baselineMedianMs: 40,
        candidateMedianMs: 41.4,
        deltaMs: 1.4,
        deltaPercent: 3.5,
      });
    expect(comparison.failures).toEqual([
      "codegen median regressed by 3.50% (limit 2.00%)",
    ]);
  });

  it("limits compile phase benchmark threshold failures to selected gate phases", () => {
    const baseline = createPhaseBenchmarkFixture({
      lex: 10,
      parse: 100,
      full: 100,
      codegen: 40,
    });
    const candidate = createPhaseBenchmarkFixture({
      lex: 20,
      parse: 120,
      full: 101,
      codegen: 40.4,
    });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        gatePhases: ["codegen", "full"],
        maxPhaseRegressionPercent: 2,
        maxFullRegressionPercent: 2,
      },
    );

    expect(comparison.ok).toBe(true);
    expect(comparison.phaseDeltas.map((delta) => delta.phase)).toEqual([
      "lex",
      "parse",
      "typecheck",
      "codegen",
      "full",
    ]);
    expect(comparison.failures).toEqual([]);
  });

  it("keeps compile phase benchmark comparison defaults gating every phase", () => {
    const baseline = createPhaseBenchmarkFixture({ lex: 10 });
    const candidate = createPhaseBenchmarkFixture({ lex: 20 });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        maxPhaseRegressionPercent: 2,
      },
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.failures).toContain(
      "lex median regressed by 100.00% (limit 2.00%)",
    );
  });

  it("fails compile phase benchmark comparisons on signature drift", () => {
    const baseline = createPhaseBenchmarkFixture({});
    const candidate = createPhaseBenchmarkFixture({
      tokenSignature: "b".repeat(64),
      irHash: "c".repeat(64),
    });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        gatePhases: ["codegen"],
      },
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.signaturesMatch).toBe(false);
    expect(comparison.failures).toEqual([
      "tokenSignature changed",
      "irHash changed",
    ]);
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

  it("hashes compile phase signatures only on the final measured round", () => {
    const source = readFileSync(
      join(process.cwd(), "benchmark", "measure_compilation.ts"),
      "utf8",
    );
    const start = source.indexOf("for (let i = 0; i < warmups + rounds; i++)");
    const end = source.indexOf("return {", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const loopSource = source.slice(start, end);
    expect(source).toContain("const finalMeasuredRound = warmups + rounds - 1");
    expect(loopSource).toContain("if (i === finalMeasuredRound)");
    expect(loopSource).toContain("tokenSignature = hashTokens(tokens)");
    expect(loopSource).toContain("irHash = hashString(ir)");
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

function createPhaseBenchmarkFixture(
  overrides: Partial<
    Pick<CompilePhaseBenchmarkResult, "tokenSignature" | "irHash"> & {
      tokenCount: number;
      lex: number;
      parse: number;
      typecheck: number;
      codegen: number;
      full: number;
    }
  >,
): CompilePhaseBenchmarkResult {
  return {
    mode: "phases",
    rounds: 31,
    warmups: 5,
    functionCount: 5000,
    sourceLength: 987569,
    tokenCount: overrides.tokenCount ?? 265230,
    tokenSignature: overrides.tokenSignature ?? "a".repeat(64),
    irHash: overrides.irHash ?? "d".repeat(64),
    lex: createPhaseStats(overrides.lex ?? 40),
    parse: createPhaseStats(overrides.parse ?? 240),
    typecheck: createPhaseStats(overrides.typecheck ?? 100),
    codegen: createPhaseStats(overrides.codegen ?? 40),
    full: createPhaseStats(overrides.full ?? 100),
  };
}

function createPhaseStats(medianMs: number) {
  return {
    medianMs,
    averageMs: medianMs,
  };
}
