#!/usr/bin/env bun

import { spawnSync } from "child_process";
import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

type LanguageKey = "bpl" | "c" | "go" | "javascript" | "python";

export interface BenchmarkSources {
  stem: string;
  bpl?: string;
  c?: string;
  go?: string;
  javascript?: string;
  python?: string;
}

interface Stats {
  minMs: number;
  medianMs: number;
  averageMs: number;
}

interface RunnerOptions {
  runs: number;
  warmups: number;
  validate: boolean;
  json: boolean;
  languages?: Set<LanguageKey>;
  benchmarks: string[];
}

interface CommandSpec {
  cmd: string;
  args: string[];
}

interface PreparedLanguage {
  key: LanguageKey;
  label: string;
  run: CommandSpec;
  cleanup: string[];
}

interface BenchmarkResult {
  benchmark: string;
  language: string;
  status: "ok" | "skipped" | "failed" | "mismatch";
  minMs?: number;
  medianMs?: number;
  averageMs?: number;
  runs?: number;
  output?: string;
  message?: string;
}

const BENCHMARK_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(BENCHMARK_ROOT, "..");
const BPL_COMPILER = join(REPO_ROOT, "index.ts");

export function calculateStats(samples: number[]): Stats {
  if (samples.length === 0) {
    return { minMs: 0, medianMs: 0, averageMs: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;

  return {
    minMs: sorted[0]!,
    medianMs,
    averageMs:
      sorted.reduce((total, sample) => total + sample, 0) / sorted.length,
  };
}

export function compareBenchmarkOutputs(
  expected: string,
  actual: string,
): boolean {
  return normalizeOutput(expected) === normalizeOutput(actual);
}

export function discoverBenchmarkSources(files: string[]): BenchmarkSources {
  const sortedFiles = [...files].sort();
  const bpl = sortedFiles.find((file) => file.endsWith(".bpl"));
  const stem =
    bpl?.replace(/\.bpl$/, "") ??
    sortedFiles
      .find((file) => /\.(c|go|js|py)$/.test(file))
      ?.replace(/\.(c|go|js|py)$/, "") ??
    "";
  const sources: BenchmarkSources = { stem };

  for (const file of sortedFiles) {
    if (file === `${stem}.bpl`) sources.bpl = file;
    if (file === `${stem}.c`) sources.c = file;
    if (file === `${stem}.go`) sources.go = file;
    if (file === `${stem}.js`) sources.javascript = file;
    if (file === `${stem}.py`) sources.python = file;
  }

  return sources;
}

function normalizeOutput(output: string): string {
  return output.replace(/\r\n/g, "\n").trim();
}

function parseArgs(args: string[]): RunnerOptions {
  const options: RunnerOptions = {
    runs: 3,
    warmups: 1,
    validate: true,
    json: false,
    benchmarks: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--runs") {
      options.runs = parseNonNegativeInt(args[++i], "--runs");
    } else if (arg === "--warmups") {
      options.warmups = parseNonNegativeInt(args[++i], "--warmups");
    } else if (arg === "--no-validate") {
      options.validate = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--language" || arg === "--languages") {
      options.languages = new Set(
        (args[++i] ?? "")
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean) as LanguageKey[],
      );
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      options.benchmarks.push(arg);
    }
  }

  return options;
}

function parseNonNegativeInt(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} expects a non-negative integer`);
  }
  return parsed;
}

function printHelp(): void {
  console.log(`Usage: bun benchmark/run_benchmark.ts [options] [benchmark...]

Options:
  --runs N              timed runs per language (default: 3)
  --warmups N           untimed warmup runs per language (default: 1)
  --language a,b        comma-separated languages: bpl,c,go,javascript,python
  --no-validate         skip output comparison against BPL
  --json                print JSON and write benchmark/results.json
`);
}

function commandExists(command: string): boolean {
  return (
    spawnSync("command", ["-v", command], {
      shell: true,
      stdio: "ignore",
    }).status === 0
  );
}

function runCommand(command: CommandSpec, cwd: string) {
  return spawnSync(command.cmd, command.args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
}

function timeCommand(command: CommandSpec, cwd: string): {
  status: number | null;
  stdout: string;
  stderr: string;
  ms: number;
} {
  const start = process.hrtime.bigint();
  const result = runCommand(command, cwd);
  const end = process.hrtime.bigint();

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ms: Number(end - start) / 1_000_000,
  };
}

function cleanupFiles(dir: string, files: string[]): void {
  for (const file of files) {
    const fullPath = join(dir, file);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }
}

function skipped(language: string, message: string): BenchmarkResult {
  return { benchmark: "", language, status: "skipped", message };
}

function failed(language: string, message: string): BenchmarkResult {
  return { benchmark: "", language, status: "failed", message: message.trim() };
}

function compileBenchmarkLanguage(
  dir: string,
  sources: BenchmarkSources,
  language: LanguageKey,
): PreparedLanguage | BenchmarkResult {
  const stem = sources.stem;

  if (language === "bpl") {
    if (!sources.bpl) return skipped("BPL", "missing .bpl source");
    if (!commandExists("bun")) return skipped("BPL", "bun not installed");

    const result = runCommand(
      { cmd: "bun", args: [BPL_COMPILER, sources.bpl, "-O", "3"] },
      dir,
    );
    if (result.status !== 0) return failed("BPL", result.stderr || result.stdout);

    return {
      key: "bpl",
      label: "BPL (-O3)",
      run: { cmd: join(dir, stem), args: [] },
      cleanup: [stem, `${stem}.ll`, "ir.ll"],
    };
  }

  if (language === "c") {
    if (!sources.c) return skipped("C", "missing .c source");
    const compiler = commandExists("clang")
      ? "clang"
      : commandExists("gcc")
        ? "gcc"
        : undefined;
    if (!compiler) return skipped("C", "clang/gcc not installed");

    const binary = `${stem}_c`;
    const result = runCommand(
      { cmd: compiler, args: ["-O3", sources.c, "-o", binary] },
      dir,
    );
    if (result.status !== 0) return failed("C", result.stderr || result.stdout);

    return {
      key: "c",
      label: `C (${compiler} -O3)`,
      run: { cmd: join(dir, binary), args: [] },
      cleanup: [binary],
    };
  }

  if (language === "go") {
    if (!sources.go) return skipped("Go", "missing .go source");
    if (!commandExists("go")) return skipped("Go", "go not installed");

    const binary = `${stem}_go`;
    const result = runCommand(
      { cmd: "go", args: ["build", "-o", binary, sources.go] },
      dir,
    );
    if (result.status !== 0) return failed("Go", result.stderr || result.stdout);

    return {
      key: "go",
      label: "Go",
      run: { cmd: join(dir, binary), args: [] },
      cleanup: [binary],
    };
  }

  if (language === "javascript") {
    if (!sources.javascript) return skipped("Node.js", "missing .js source");
    if (!commandExists("node")) return skipped("Node.js", "node not installed");
    return {
      key: "javascript",
      label: "Node.js",
      run: { cmd: "node", args: [sources.javascript] },
      cleanup: [],
    };
  }

  if (!sources.python) return skipped("Python", "missing .py source");
  if (!commandExists("python3")) return skipped("Python", "python3 not installed");
  return {
    key: "python",
    label: "Python",
    run: { cmd: "python3", args: [sources.python] },
    cleanup: [],
  };
}

function discoverBenchmarkDirs(options: RunnerOptions): string[] {
  const names = readdirSync(BENCHMARK_ROOT)
    .filter((entry) => {
      const fullPath = join(BENCHMARK_ROOT, entry);
      return statSync(fullPath).isDirectory();
    })
    .filter((entry) =>
      readdirSync(join(BENCHMARK_ROOT, entry)).some((file) =>
        file.endsWith(".bpl"),
      ),
    )
    .sort();

  if (options.benchmarks.length === 0) return names;
  const requested = new Set(options.benchmarks);
  return names.filter((name) => requested.has(name));
}

function runBenchmark(
  benchmarkName: string,
  options: RunnerOptions,
): BenchmarkResult[] {
  const dir = join(BENCHMARK_ROOT, benchmarkName);
  const sources = discoverBenchmarkSources(readdirSync(dir));
  const languageOrder: LanguageKey[] = [
    "bpl",
    "c",
    "go",
    "javascript",
    "python",
  ];
  const languages = options.languages
    ? languageOrder.filter((language) => options.languages!.has(language))
    : languageOrder;

  const prepared: PreparedLanguage[] = [];
  const results: BenchmarkResult[] = [];

  for (const language of languages) {
    const compiled = compileBenchmarkLanguage(dir, sources, language);
    if ("status" in compiled) {
      results.push({ ...compiled, benchmark: benchmarkName });
    } else {
      prepared.push(compiled);
    }
  }

  const bpl = prepared.find((language) => language.key === "bpl");
  let expectedOutput: string | undefined;
  if (options.validate && bpl) {
    const validation = runCommand(bpl.run, dir);
    if (validation.status !== 0) {
      results.push({
        benchmark: benchmarkName,
        language: bpl.label,
        status: "failed",
        message: validation.stderr || validation.stdout,
      });
      cleanupFiles(dir, prepared.flatMap((language) => language.cleanup));
      return results;
    }
    expectedOutput = validation.stdout ?? "";
  }

  for (const language of prepared) {
    for (let i = 0; i < options.warmups; i++) {
      const warmup = runCommand(language.run, dir);
      if (warmup.status !== 0) {
        results.push({
          benchmark: benchmarkName,
          language: language.label,
          status: "failed",
          message: warmup.stderr || warmup.stdout,
        });
        continue;
      }
    }

    if (expectedOutput !== undefined && language.key !== "bpl") {
      const validation = runCommand(language.run, dir);
      if (
        validation.status !== 0 ||
        !compareBenchmarkOutputs(expectedOutput, validation.stdout ?? "")
      ) {
        results.push({
          benchmark: benchmarkName,
          language: language.label,
          status: "mismatch",
          output: normalizeOutput(validation.stdout ?? ""),
          message: `expected ${JSON.stringify(normalizeOutput(expectedOutput))}`,
        });
        continue;
      }
    }

    const samples: number[] = [];
    let failedRun: string | undefined;
    for (let i = 0; i < options.runs; i++) {
      const timed = timeCommand(language.run, dir);
      if (timed.status !== 0) {
        failedRun = timed.stderr || timed.stdout;
        break;
      }
      samples.push(timed.ms);
    }

    if (failedRun !== undefined) {
      results.push({
        benchmark: benchmarkName,
        language: language.label,
        status: "failed",
        message: failedRun,
      });
      continue;
    }

    const stats = calculateStats(samples);
    results.push({
      benchmark: benchmarkName,
      language: language.label,
      status: "ok",
      minMs: stats.minMs,
      medianMs: stats.medianMs,
      averageMs: stats.averageMs,
      runs: samples.length,
    });
  }

  cleanupFiles(dir, prepared.flatMap((language) => language.cleanup));
  return results;
}

function printResults(results: BenchmarkResult[]): void {
  let current = "";
  for (const result of results) {
    if (result.benchmark !== current) {
      current = result.benchmark;
      console.log(`\n=== ${current} ===`);
    }

    if (result.status === "ok") {
      console.log(
        `${result.language.padEnd(16)} min ${result.minMs!.toFixed(2).padStart(8)} ms  median ${result.medianMs!.toFixed(2).padStart(8)} ms  runs ${result.runs}`,
      );
    } else {
      console.log(
        `${result.language.padEnd(16)} ${result.status}: ${result.message ?? result.output ?? ""}`,
      );
    }
  }
}

export function main(args: string[] = process.argv.slice(2)): void {
  const options = parseArgs(args);
  const benchmarkNames = discoverBenchmarkDirs(options);
  const results = benchmarkNames.flatMap((name) => runBenchmark(name, options));

  if (options.json) {
    const json = JSON.stringify(results, null, 2);
    console.log(json);
    writeFileSync(join(BENCHMARK_ROOT, "results.json"), `${json}\n`);
  } else {
    printResults(results);
  }

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
