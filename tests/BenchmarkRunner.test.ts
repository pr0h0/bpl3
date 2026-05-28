import { describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

import {
  calculateStats,
  compareBenchmarkOutputs,
  discoverBenchmarkSources,
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
    const benchmarks = ["bit_twiddle", "prime_sieve", "vector_dot_product"];
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
});
