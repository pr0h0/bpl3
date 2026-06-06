#!/usr/bin/env bun

import { spawnSync } from "child_process";
import { accessSync, constants, statSync } from "fs";
import { resolve } from "path";

import {
  buildBalancedRunSchedule,
  calculateStats,
  compareBenchmarkOutputs,
} from "./run_benchmark";

export interface BinaryComparisonArgs {
  baselinePath: string;
  candidatePath: string;
  runs: number;
  warmups: number;
  validate: boolean;
  json: boolean;
}

export interface BinaryTimingStats {
  minMs: number;
  medianMs: number;
  averageMs: number;
}

export interface BinaryTimingComparison {
  medianDeltaMs: number;
  medianImprovementPercent: number;
  averageDeltaMs: number;
  averageImprovementPercent: number;
}

export interface BinaryComparisonResult {
  baselinePath: string;
  candidatePath: string;
  runs: number;
  warmups: number;
  validated: boolean;
  baseline: BinaryTimingStats;
  candidate: BinaryTimingStats;
  comparison: BinaryTimingComparison;
}

interface Executable {
  label: "Baseline" | "Candidate";
  path: string;
}

export function parseBinaryComparisonArgs(args: string[]): BinaryComparisonArgs {
  let runs = 101;
  let warmups = 5;
  let validate = true;
  let json = false;
  const paths: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--runs") {
      runs = parsePositiveInteger(args[++i], "--runs");
    } else if (arg === "--warmups") {
      warmups = parseNonNegativeInteger(args[++i], "--warmups");
    } else if (arg === "--no-validate") {
      validate = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      paths.push(arg);
    }
  }

  if (paths.length !== 2) {
    throw new Error("Binary comparison expects exactly two executable paths");
  }

  return {
    baselinePath: paths[0]!,
    candidatePath: paths[1]!,
    runs,
    warmups,
    validate,
    json,
  };
}

export function compareBinaryTimingStats(
  baseline: BinaryTimingStats,
  candidate: BinaryTimingStats,
): BinaryTimingComparison {
  return {
    medianDeltaMs: round(candidate.medianMs - baseline.medianMs),
    medianImprovementPercent: round(
      ((baseline.medianMs - candidate.medianMs) / baseline.medianMs) * 100,
    ),
    averageDeltaMs: round(candidate.averageMs - baseline.averageMs),
    averageImprovementPercent: round(
      ((baseline.averageMs - candidate.averageMs) / baseline.averageMs) * 100,
    ),
  };
}

export function runBinaryComparison(
  options: BinaryComparisonArgs,
): BinaryComparisonResult {
  const executables: Executable[] = [
    prepareExecutable("Baseline", options.baselinePath),
    prepareExecutable("Candidate", options.candidatePath),
  ];

  if (options.validate) {
    const baselineOutput = runExecutable(executables[0]!, "validation").stdout;
    const candidateOutput = runExecutable(executables[1]!, "validation").stdout;
    if (!compareBenchmarkOutputs(baselineOutput, candidateOutput)) {
      throw new Error("Candidate output does not match baseline output");
    }
  }

  for (const executable of buildBalancedRunSchedule(
    executables,
    options.warmups,
  )) {
    runExecutable(executable, "warmup");
  }

  const samples = new Map<Executable, number[]>(
    executables.map((executable) => [executable, []]),
  );
  for (const executable of buildBalancedRunSchedule(
    executables,
    options.runs,
  )) {
    samples.get(executable)!.push(timeExecutable(executable));
  }

  const baseline = calculateStats(samples.get(executables[0]!)!);
  const candidate = calculateStats(samples.get(executables[1]!)!);
  return {
    baselinePath: executables[0]!.path,
    candidatePath: executables[1]!.path,
    runs: options.runs,
    warmups: options.warmups,
    validated: options.validate,
    baseline,
    candidate,
    comparison: compareBinaryTimingStats(baseline, candidate),
  };
}

export function formatBinaryComparisonResult(
  result: BinaryComparisonResult,
): string {
  const validation = result.validated ? "output validated" : "validation skipped";
  return [
    `Binary A/B comparison (${result.runs} runs, ${result.warmups} warmups, ${validation})`,
    `Baseline:  ${result.baselinePath}`,
    `Candidate: ${result.candidatePath}`,
    `Baseline   min ${result.baseline.minMs.toFixed(2)} ms  median ${result.baseline.medianMs.toFixed(2)} ms  average ${result.baseline.averageMs.toFixed(2)} ms`,
    `Candidate  min ${result.candidate.minMs.toFixed(2)} ms  median ${result.candidate.medianMs.toFixed(2)} ms  average ${result.candidate.averageMs.toFixed(2)} ms`,
    `Candidate improvement: median ${formatSigned(result.comparison.medianImprovementPercent)}% (${formatSigned(result.comparison.medianDeltaMs)} ms)  average ${formatSigned(result.comparison.averageImprovementPercent)}% (${formatSigned(result.comparison.averageDeltaMs)} ms)`,
  ].join("\n");
}

function prepareExecutable(
  label: Executable["label"],
  executablePath: string,
): Executable {
  const path = resolve(executablePath);
  try {
    accessSync(path, constants.X_OK);
    if (!statSync(path).isFile()) {
      throw new Error("not a file");
    }
  } catch {
    throw new Error(`${label} executable is not runnable: ${path}`);
  }
  return { label, path };
}

function runExecutable(
  executable: Executable,
  phase: string,
): { stdout: string } {
  const result = spawnSync(executable.path, [], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${executable.label} executable failed during ${phase}${message ? `: ${message}` : ""}`,
    );
  }
  return { stdout: result.stdout ?? "" };
}

function timeExecutable(executable: Executable): number {
  const start = process.hrtime.bigint();
  runExecutable(executable, "timing");
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const parsed = parseNonNegativeInteger(value, flag);
  if (parsed === 0) {
    throw new Error(`${flag} must be greater than 0`);
  }
  return parsed;
}

function parseNonNegativeInteger(
  value: string | undefined,
  flag: string,
): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return Number(value);
}

function round(value: number): number {
  return Number(value.toFixed(10));
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function printUsage(): void {
  console.log(`Usage: bun benchmark/compare_binaries.ts [options] BASELINE CANDIDATE

Options:
  --runs N        timed runs per executable (default: 101)
  --warmups N     untimed warmup runs per executable (default: 5)
  --no-validate   skip output comparison before timing
  --json          print structured JSON
  --help          show this help
`);
}

export function main(args: string[] = process.argv.slice(2)): void {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseBinaryComparisonArgs(args);
  const result = runBinaryComparison(options);
  console.log(
    options.json
      ? JSON.stringify(result, null, 2)
      : formatBinaryComparisonResult(result),
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
