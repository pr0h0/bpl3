import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildBplVsCComparisons,
  buildBalancedRunSchedule,
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
  hashTokensForBenchmark,
  measureCompilePhases,
  parseCompilationBenchmarkArgs,
  readCompilePhaseBenchmarkResult,
  type CompilePhaseBenchmarkResult,
} from "../benchmark/measure_compilation";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";

describe("Benchmark runner helpers", () => {
  it("keeps binary comparison tooling import-safe", () => {
    const filePath = join(
      process.cwd(),
      "benchmark",
      "compare_binaries.ts",
    );

    expect(existsSync(filePath)).toBe(true);
    if (!existsSync(filePath)) return;

    const source = readFileSync(filePath, "utf8");
    expect(source).toContain("if (import.meta.main)");
    expect(source).not.toContain("\nmain();");
  });

  it("exports a binary comparison argument parser", async () => {
    const comparison = await import("../benchmark/compare_binaries");

    expect(comparison.parseBinaryComparisonArgs).toBeFunction();
  });

  it("parses binary comparison paths and timing options", async () => {
    const { parseBinaryComparisonArgs } = await import(
      "../benchmark/compare_binaries"
    );

    expect(
      parseBinaryComparisonArgs([
        "--runs",
        "7",
        "--warmups",
        "2",
        "--no-validate",
        "--json",
        "/tmp/baseline",
        "/tmp/candidate",
      ]),
    ).toEqual({
      baselinePath: "/tmp/baseline",
      candidatePath: "/tmp/candidate",
      runs: 7,
      warmups: 2,
      validate: false,
      json: true,
    });
  });

  it("rejects invalid binary comparison arguments", async () => {
    const { parseBinaryComparisonArgs } = await import(
      "../benchmark/compare_binaries"
    );

    expect(() => parseBinaryComparisonArgs(["/tmp/baseline"])).toThrow(
      "expects exactly two executable paths",
    );
    expect(() =>
      parseBinaryComparisonArgs([
        "--runs",
        "0",
        "/tmp/baseline",
        "/tmp/candidate",
      ]),
    ).toThrow("--runs must be greater than 0");
    expect(() =>
      parseBinaryComparisonArgs([
        "--warmups",
        "-1",
        "/tmp/baseline",
        "/tmp/candidate",
      ]),
    ).toThrow("--warmups must be a non-negative integer");
    expect(() =>
      parseBinaryComparisonArgs([
        "--unknown",
        "/tmp/baseline",
        "/tmp/candidate",
      ]),
    ).toThrow("Unknown option: --unknown");
  });

  it("reports positive binary timing improvements when the candidate is faster", async () => {
    const { compareBinaryTimingStats } = await import(
      "../benchmark/compare_binaries"
    );

    expect(
      compareBinaryTimingStats(
        { minMs: 80, medianMs: 100, averageMs: 110 },
        { minMs: 70, medianMs: 90, averageMs: 99 },
      ),
    ).toEqual({
      medianDeltaMs: -10,
      medianImprovementPercent: 10,
      averageDeltaMs: -11,
      averageImprovementPercent: 10,
    });
  });

  it("uses balanced schedules for binary comparison warmups and timings", () => {
    const source = readFileSync(
      join(process.cwd(), "benchmark", "compare_binaries.ts"),
      "utf8",
    );

    expect(source).toMatch(
      /buildBalancedRunSchedule\(\s*executables,\s*options\.warmups,\s*\)/,
    );
    expect(source).toMatch(
      /buildBalancedRunSchedule\(\s*executables,\s*options\.runs,\s*\)/,
    );
  });

  it("validates and times matching prebuilt binaries", async () => {
    const { runBinaryComparison } = await import(
      "../benchmark/compare_binaries"
    );
    const dir = mkdtempSync(join(tmpdir(), "bpl-binary-comparison-"));
    try {
      const baselinePath = writeBenchmarkExecutable(dir, "baseline", "same");
      const candidatePath = writeBenchmarkExecutable(dir, "candidate", "same");

      const result = runBinaryComparison({
        baselinePath,
        candidatePath,
        runs: 2,
        warmups: 1,
        validate: true,
        json: false,
      });

      expect(result).toMatchObject({
        baselinePath,
        candidatePath,
        runs: 2,
        warmups: 1,
        validated: true,
      });
      expect(result.baseline.medianMs).toBeGreaterThan(0);
      expect(result.candidate.medianMs).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects mismatched prebuilt binary output before timing", async () => {
    const { runBinaryComparison } = await import(
      "../benchmark/compare_binaries"
    );
    const dir = mkdtempSync(join(tmpdir(), "bpl-binary-comparison-"));
    try {
      const baselinePath = writeBenchmarkExecutable(dir, "baseline", "before");
      const candidatePath = writeBenchmarkExecutable(dir, "candidate", "after");

      expect(() =>
        runBinaryComparison({
          baselinePath,
          candidatePath,
          runs: 1,
          warmups: 0,
          validate: true,
          json: false,
        }),
      ).toThrow("Candidate output does not match baseline output");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats deterministic binary comparison text", async () => {
    const { formatBinaryComparisonResult } = await import(
      "../benchmark/compare_binaries"
    );

    expect(
      formatBinaryComparisonResult({
        baselinePath: "/tmp/baseline",
        candidatePath: "/tmp/candidate",
        runs: 7,
        warmups: 2,
        validated: true,
        baseline: { minMs: 80, medianMs: 100, averageMs: 110 },
        candidate: { minMs: 70, medianMs: 90, averageMs: 99 },
        comparison: {
          medianDeltaMs: -10,
          medianImprovementPercent: 10,
          averageDeltaMs: -11,
          averageImprovementPercent: 10,
        },
      }),
    ).toBe(`Binary A/B comparison (7 runs, 2 warmups, output validated)
Baseline:  /tmp/baseline
Candidate: /tmp/candidate
Baseline   min 80.00 ms  median 100.00 ms  average 110.00 ms
Candidate  min 70.00 ms  median 90.00 ms  average 99.00 ms
Candidate improvement: median +10.00% (-10.00 ms)  average +10.00% (-11.00 ms)`);
  });

  it("runs binary comparison CLI with machine-readable output", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-binary-comparison-"));
    try {
      const baselinePath = writeBenchmarkExecutable(dir, "baseline", "same");
      const candidatePath = writeBenchmarkExecutable(dir, "candidate", "same");
      const result = spawnSync(
        "bun",
        [
          "benchmark/compare_binaries.ts",
          "--runs",
          "1",
          "--warmups",
          "0",
          "--json",
          baselinePath,
          candidatePath,
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        baselinePath,
        candidatePath,
        runs: 1,
        warmups: 0,
        validated: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("documents reusable prebuilt binary comparison", () => {
    const readme = readFileSync(
      join(process.cwd(), "benchmark", "README.md"),
      "utf8",
    );

    expect(readme).toContain("compare_binaries.ts");
    expect(readme).toContain("--no-validate");
    expect(readme).toContain("positive improvement");
  });

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
    expect(readme).toContain("--timing-baseline");
    expect(readme).toContain("--noise-control");
    expect(readme).toContain("--max-noise-control-regression");
    expect(readme).toContain("--candidate-result");
    expect(readme).toContain("--gate-phases");
    expect(readme).toContain("--max-full-regression");
    expect(readme).toContain("--tree-shake-top-level-functions");
  });

  it("compares saved compile phase candidate results without remeasuring", () => {
    const source = readFileSync(
      join(process.cwd(), "benchmark", "measure_compilation.ts"),
      "utf8",
    );
    const phaseBranch = source.indexOf('if (options.mode === "phases")');
    const comparisonBranch = source.indexOf(
      "const comparison =",
      phaseBranch,
    );

    expect(phaseBranch).toBeGreaterThanOrEqual(0);
    expect(comparisonBranch).toBeGreaterThan(phaseBranch);

    const resultPrefix = source.slice(phaseBranch, comparisonBranch);
    expect(resultPrefix).toContain("options.candidateResult !== undefined");
    expect(resultPrefix).toContain(
      "readCompilePhaseBenchmarkResult(options.candidateResult)",
    );
    expect(resultPrefix).toContain("measureCompilePhases");
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
        "--timing-baseline",
        "/tmp/control.json",
        "--noise-control",
        "/tmp/noise-control.json",
        "--candidate-result",
        "/tmp/candidate.json",
        "--max-noise-control-regression",
        "2",
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
      timingBaseline: "/tmp/control.json",
      noiseControl: "/tmp/noise-control.json",
      candidateResult: "/tmp/candidate.json",
      maxNoiseControlRegressionPercent: 2,
      maxPhaseRegressionPercent: 2.5,
      maxFullRegressionPercent: 1,
    });
  });

  it("rejects timing baseline without a comparison baseline", () => {
    expect(() =>
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--timing-baseline",
        "/tmp/control.json",
      ]),
    ).toThrow("--timing-baseline requires --compare");
  });

  it("rejects noise control without a comparison baseline", () => {
    expect(() =>
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--noise-control",
        "/tmp/control.json",
      ]),
    ).toThrow("--noise-control requires --compare");
  });

  it("rejects saved candidate results without a comparison baseline", () => {
    expect(() =>
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--candidate-result",
        "/tmp/candidate.json",
      ]),
    ).toThrow("--candidate-result requires --compare");
  });

  it("rejects max noise-control regression without a noise-control file", () => {
    expect(() =>
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--compare",
        "/tmp/baseline.json",
        "--max-noise-control-regression",
        "2",
      ]),
    ).toThrow("--max-noise-control-regression requires --noise-control");
  });

  it("parses compile phase benchmark top-level tree-shake option", () => {
    expect(
      parseCompilationBenchmarkArgs([
        "--mode",
        "phases",
        "--tree-shake-top-level-functions",
      ]),
    ).toMatchObject({
      mode: "phases",
      treeShakeTopLevelFunctions: true,
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

  it("uses timing baseline medians while validating candidate signatures against the behavior baseline", () => {
    const baseline = createPhaseBenchmarkFixture({
      full: 100,
      codegen: 40,
    });
    const timingBaseline = createPhaseBenchmarkFixture({
      full: 140,
      codegen: 70,
    });
    const candidate = createPhaseBenchmarkFixture({
      full: 141,
      codegen: 70.7,
    });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        timingBaseline,
        gatePhases: ["codegen", "full"],
        maxPhaseRegressionPercent: 2,
        maxFullRegressionPercent: 2,
      },
    );

    expect(comparison.ok).toBe(true);
    expect(comparison.signaturesMatch).toBe(true);
    expect(comparison.timingBaselineMatches).toBe(true);
    expect(comparison.phaseDeltas.find((delta) => delta.phase === "codegen"))
      .toMatchObject({
        baselineMedianMs: 70,
        candidateMedianMs: 70.7,
        deltaPercent: 1,
      });
    expect(comparison.phaseDeltas.find((delta) => delta.phase === "full"))
      .toMatchObject({
        baselineMedianMs: 140,
        candidateMedianMs: 141,
      });
  });

  it("fails compile phase benchmark comparisons when timing baseline signatures drift", () => {
    const baseline = createPhaseBenchmarkFixture({});
    const timingBaseline = createPhaseBenchmarkFixture({
      tokenSignature: "b".repeat(64),
    });
    const candidate = createPhaseBenchmarkFixture({});

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        timingBaseline,
        gatePhases: ["full"],
        maxFullRegressionPercent: 2,
      },
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.signaturesMatch).toBe(true);
    expect(comparison.timingBaselineMatches).toBe(false);
    expect(comparison.failures).toContain(
      "timingBaseline tokenSignature changed",
    );
  });

  it("normalizes compile phase benchmark gates with clean-control drift", () => {
    const baseline = createPhaseBenchmarkFixture({
      full: 100,
      codegen: 40,
    });
    const noiseControl = createPhaseBenchmarkFixture({
      full: 106,
      codegen: 41,
    });
    const candidate = createPhaseBenchmarkFixture({
      full: 106.5,
      codegen: 41.4,
    });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        noiseControl,
        gatePhases: ["codegen", "full"],
        maxPhaseRegressionPercent: 2,
        maxFullRegressionPercent: 1,
      },
    );

    expect(comparison.ok).toBe(true);
    expect(comparison.noiseControlMatches).toBe(true);
    expect(comparison.failures).toEqual([]);
    expect(comparison.phaseDeltas.find((delta) => delta.phase === "full"))
      .toMatchObject({
        baselineMedianMs: 100,
        candidateMedianMs: 106.5,
        noiseControlMedianMs: 106,
        deltaPercent: 6.5,
        noiseControlDeltaPercent: 6,
        normalizedDeltaPercent: 0.5,
      });
    expect(comparison.phaseDeltas.find((delta) => delta.phase === "codegen"))
      .toMatchObject({
        deltaPercent: 3.5,
        noiseControlDeltaPercent: 2.5,
        normalizedDeltaPercent: 1,
      });
  });

  it("fails compile phase benchmark comparisons when clean-control drift exceeds the explicit noise threshold", () => {
    const baseline = createPhaseBenchmarkFixture({
      full: 100,
      codegen: 40,
    });
    const noiseControl = createPhaseBenchmarkFixture({
      full: 104,
      codegen: 40.6,
    });
    const candidate = createPhaseBenchmarkFixture({
      full: 104.5,
      codegen: 41,
    });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        noiseControl,
        gatePhases: ["codegen", "full"],
        maxNoiseControlRegressionPercent: 2,
        maxPhaseRegressionPercent: 2,
        maxFullRegressionPercent: 1,
      },
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.failures).toContain(
      "full noise-control median drifted by 4.00% (limit 2.00%)",
    );
    expect(comparison.failures).not.toContain(
      "codegen noise-control median drifted by 1.50% (limit 2.00%)",
    );
  });

  it("still fails compile phase benchmark gates when drift exceeds noise control", () => {
    const baseline = createPhaseBenchmarkFixture({ full: 100 });
    const noiseControl = createPhaseBenchmarkFixture({ full: 105 });
    const candidate = createPhaseBenchmarkFixture({ full: 108 });

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        noiseControl,
        gatePhases: ["full"],
        maxFullRegressionPercent: 1,
      },
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.failures).toEqual([
      "full median regressed by 8.00% normalized to 3.00% after noise control (limit 1.00%)",
    ]);
  });

  it("fails compile phase benchmark comparisons when noise control signatures drift", () => {
    const baseline = createPhaseBenchmarkFixture({});
    const noiseControl = createPhaseBenchmarkFixture({
      irHash: "c".repeat(64),
    });
    const candidate = createPhaseBenchmarkFixture({});

    const comparison = compareCompilePhaseBenchmarkResults(
      baseline,
      candidate,
      {
        noiseControl,
        gatePhases: ["full"],
        maxFullRegressionPercent: 2,
      },
    );

    expect(comparison.ok).toBe(false);
    expect(comparison.signaturesMatch).toBe(true);
    expect(comparison.noiseControlMatches).toBe(false);
    expect(comparison.failures).toContain("noiseControl irHash changed");
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

  it("reads raw and wrapped compile phase benchmark result files", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-phase-baseline-"));
    try {
      const rawPath = join(dir, "raw.json");
      const wrappedPath = join(dir, "wrapped.json");
      const result = createPhaseBenchmarkFixture({ full: 123 });
      writeFileSync(rawPath, JSON.stringify(result));
      writeFileSync(
        wrappedPath,
        JSON.stringify({
          result,
          comparison: compareCompilePhaseBenchmarkResults(result, result),
        }),
      );

      expect(readCompilePhaseBenchmarkResult(rawPath).full.medianMs).toBe(123);
      expect(readCompilePhaseBenchmarkResult(wrappedPath).full.medianMs).toBe(
        123,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    expect(result.treeShakeTopLevelFunctions).toBe(false);
  });

  it("can measure compile phases with top-level tree shaking enabled", async () => {
    const defaultResult = await measureCompilePhases({
      functionCount: 3,
      rounds: 1,
      warmups: 0,
    });
    const treeShakenResult = await measureCompilePhases({
      functionCount: 3,
      rounds: 1,
      warmups: 0,
      treeShakeTopLevelFunctions: true,
    });

    expect(treeShakenResult.treeShakeTopLevelFunctions).toBe(true);
    expect(defaultResult.treeShakeTopLevelFunctions).toBe(false);
    expect(treeShakenResult.tokenSignature).toBe(
      defaultResult.tokenSignature,
    );
    expect(treeShakenResult.irHash).not.toBe(defaultResult.irHash);
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

  it("preserves the benchmark token signature contract", () => {
    const source = generateSyntheticCompileSource(3);
    const tokens = lexWithGrammar(source, "perf_3.bpl");

    expect(hashTokensForBenchmark(tokens)).toBe(
      "83df85f5af58c819b94c3641583201a31148d3f74da40043654f2964f76f5db3",
    );
  });

  it("keeps token signature hashing off per-token template coercion", () => {
    const source = readFileSync(
      join(process.cwd(), "benchmark", "measure_compilation.ts"),
      "utf8",
    );
    const start = source.indexOf("export function hashTokensForBenchmark");
    const end = source.indexOf("\n}\n\nfunction generateLegacyHugeFile", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const helperSource = source.slice(start, end);
    expect(helperSource).toContain('token.type + "\\0"');
    expect(helperSource).not.toContain("String(token.type)");
    expect(helperSource).not.toContain("String(token.line)");
    expect(helperSource).not.toContain("String(token.column)");
  });

  it("calculates sorted min, median, and average timings", () => {
    const stats = calculateStats([30, 10, 20, 40]);

    expect(stats.minMs).toBe(10);
    expect(stats.medianMs).toBe(25);
    expect(stats.averageMs).toBe(25);
  });

  it("balances benchmark language positions across timed rounds", () => {
    expect(buildBalancedRunSchedule(["bpl", "c", "go"], 4)).toEqual([
      "bpl",
      "c",
      "go",
      "c",
      "go",
      "bpl",
      "go",
      "bpl",
      "c",
      "bpl",
      "c",
      "go",
    ]);
    expect(buildBalancedRunSchedule(["bpl", "c"], 0)).toEqual([]);
    expect(buildBalancedRunSchedule([], 3)).toEqual([]);
  });

  it("uses the balanced schedule for runtime benchmark timings", () => {
    const source = readFileSync(
      join(process.cwd(), "benchmark", "run_benchmark.ts"),
      "utf8",
    );
    const runBenchmark = source.slice(source.indexOf("function runBenchmark"));

    expect(runBenchmark).toMatch(
      /buildBalancedRunSchedule\(\s*eligibleLanguages,\s*options\.runs,\s*\)/,
    );
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

function writeBenchmarkExecutable(
  dir: string,
  name: string,
  output: string,
): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, `#!/usr/bin/env bun\nconsole.log(${JSON.stringify(output)});\n`);
  chmodSync(filePath, 0o755);
  return filePath;
}

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
    treeShakeTopLevelFunctions: false,
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
