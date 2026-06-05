import { createHash } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

import type { Token } from "../compiler/frontend/Token";

export type CompilationBenchmarkMode = "cli" | "phases";
export type CompilePhaseName =
  | "lex"
  | "parse"
  | "typecheck"
  | "codegen"
  | "full";

export interface CompilationBenchmarkArgs {
  mode: CompilationBenchmarkMode;
  functions: number;
  rounds: number;
  warmups: number;
  json: boolean;
  treeShakeTopLevelFunctions?: boolean;
  compare?: string;
  timingBaseline?: string;
  gatePhases?: CompilePhaseName[];
  maxPhaseRegressionPercent?: number;
  maxFullRegressionPercent?: number;
}

export interface CompilePhaseStats {
  medianMs: number;
  averageMs: number;
}

export interface CompilePhaseBenchmarkResult {
  mode: "phases";
  rounds: number;
  warmups: number;
  functionCount: number;
  sourceLength: number;
  treeShakeTopLevelFunctions: boolean;
  tokenCount: number;
  tokenSignature: string;
  irHash: string;
  lex: CompilePhaseStats;
  parse: CompilePhaseStats;
  typecheck: CompilePhaseStats;
  codegen: CompilePhaseStats;
  full: CompilePhaseStats;
}

export interface CompilePhaseBenchmarkComparisonOptions {
  gatePhases?: CompilePhaseName[];
  maxPhaseRegressionPercent?: number;
  maxFullRegressionPercent?: number;
  timingBaseline?: CompilePhaseBenchmarkResult;
}

export interface CompilePhaseBenchmarkDelta {
  phase: CompilePhaseName;
  baselineMedianMs: number;
  candidateMedianMs: number;
  deltaMs: number;
  deltaPercent: number;
}

export interface CompilePhaseBenchmarkComparison {
  ok: boolean;
  tokenCountMatches: boolean;
  tokenSignatureMatches: boolean;
  irHashMatches: boolean;
  signaturesMatch: boolean;
  timingBaselineMatches: boolean;
  failures: string[];
  phaseDeltas: CompilePhaseBenchmarkDelta[];
}

const COMPILE_PHASE_NAMES: CompilePhaseName[] = [
  "lex",
  "parse",
  "typecheck",
  "codegen",
  "full",
];

const TOKEN_HASH_CHUNK_CHAR_LIMIT = 64 * 1024;
const COMPILER_PATH = path.join(__dirname, "../index.ts");
const TEMP_DIR = path.join(os.tmpdir(), "bpl_bench");

export function generateSyntheticCompileSource(functionCount: number): string {
  const lines = [
    "extern printf(fmt: string, ...) ret int;",
    "struct Pair {",
    "  first: int,",
    "  second: int,",
    "}",
  ];

  for (let i = 0; i < functionCount; i++) {
    lines.push(
      `frame helper_${i}(value: int) ret int {`,
      `  local pair: Pair = Pair { first: value + ${i}, second: value - ${i} };`,
      "  if (pair.first > pair.second) {",
      "    return pair.first;",
      "  }",
      "  return pair.second;",
      "}",
    );
  }

  lines.push("frame main() ret int {", "  local total: int = 0;");
  for (let i = 0; i < functionCount; i += 250) {
    lines.push(`  total = total + helper_${i}(${i});`);
  }
  lines.push('  printf("%d\\n", total);', "  return 0;", "}");

  return lines.join("\n");
}

export function parseCompilationBenchmarkArgs(
  args: string[],
): CompilationBenchmarkArgs {
  const options: CompilationBenchmarkArgs = {
    mode: "cli",
    functions: 5000,
    rounds: 31,
    warmups: 5,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--mode") {
      const mode = args[++i];
      if (mode !== "cli" && mode !== "phases") {
        throw new Error("--mode must be cli or phases");
      }
      options.mode = mode;
    } else if (arg === "--functions") {
      options.functions = parsePositiveInteger(args[++i], "--functions");
    } else if (arg === "--rounds") {
      options.rounds = parsePositiveInteger(args[++i], "--rounds");
    } else if (arg === "--warmups") {
      options.warmups = parseNonNegativeInteger(args[++i], "--warmups");
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--tree-shake-top-level-functions") {
      options.treeShakeTopLevelFunctions = true;
    } else if (arg === "--compare") {
      options.compare = args[++i];
      if (options.compare === undefined || options.compare.length === 0) {
        throw new Error("--compare expects a baseline phase JSON file");
      }
    } else if (arg === "--timing-baseline") {
      options.timingBaseline = args[++i];
      if (
        options.timingBaseline === undefined ||
        options.timingBaseline.length === 0
      ) {
        throw new Error("--timing-baseline expects a phase JSON file");
      }
    } else if (arg === "--gate-phases") {
      options.gatePhases = parseGatePhases(args[++i]);
    } else if (arg === "--max-phase-regression") {
      options.maxPhaseRegressionPercent = parseNonNegativeNumber(
        args[++i],
        "--max-phase-regression",
      );
    } else if (arg === "--max-full-regression") {
      options.maxFullRegressionPercent = parseNonNegativeNumber(
        args[++i],
        "--max-full-regression",
      );
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.timingBaseline !== undefined && options.compare === undefined) {
    throw new Error("--timing-baseline requires --compare");
  }

  return options;
}

export function compareCompilePhaseBenchmarkResults(
  baseline: CompilePhaseBenchmarkResult,
  candidate: CompilePhaseBenchmarkResult,
  options: CompilePhaseBenchmarkComparisonOptions = {},
): CompilePhaseBenchmarkComparison {
  const failures: string[] = [];
  const timingBaseline = options.timingBaseline ?? baseline;
  const tokenCountMatches = baseline.tokenCount === candidate.tokenCount;
  const tokenSignatureMatches =
    baseline.tokenSignature === candidate.tokenSignature;
  const irHashMatches = baseline.irHash === candidate.irHash;
  const timingBaselineTokenCountMatches =
    baseline.tokenCount === timingBaseline.tokenCount;
  const timingBaselineTokenSignatureMatches =
    baseline.tokenSignature === timingBaseline.tokenSignature;
  const timingBaselineIrHashMatches =
    baseline.irHash === timingBaseline.irHash;

  if (!tokenCountMatches) {
    failures.push("tokenCount changed");
  }
  if (!tokenSignatureMatches) {
    failures.push("tokenSignature changed");
  }
  if (!irHashMatches) {
    failures.push("irHash changed");
  }
  if (options.timingBaseline !== undefined) {
    if (!timingBaselineTokenCountMatches) {
      failures.push("timingBaseline tokenCount changed");
    }
    if (!timingBaselineTokenSignatureMatches) {
      failures.push("timingBaseline tokenSignature changed");
    }
    if (!timingBaselineIrHashMatches) {
      failures.push("timingBaseline irHash changed");
    }
  }

  const phaseDeltas = COMPILE_PHASE_NAMES.map((phase) => {
    const baselineMedianMs = timingBaseline[phase].medianMs;
    const candidateMedianMs = candidate[phase].medianMs;
    const deltaMs = candidateMedianMs - baselineMedianMs;
    const deltaPercent =
      baselineMedianMs === 0 ? 0 : (deltaMs / baselineMedianMs) * 100;
    return {
      phase,
      baselineMedianMs,
      candidateMedianMs,
      deltaMs: roundTo(deltaMs, 6),
      deltaPercent: roundTo(deltaPercent, 6),
    };
  });

  for (const delta of phaseDeltas) {
    if (
      options.gatePhases !== undefined &&
      !options.gatePhases.includes(delta.phase)
    ) {
      continue;
    }

    const maxRegression =
      delta.phase === "full"
        ? options.maxFullRegressionPercent
        : options.maxPhaseRegressionPercent;
    if (
      maxRegression !== undefined &&
      delta.deltaPercent > maxRegression
    ) {
      failures.push(
        `${delta.phase} median regressed by ${delta.deltaPercent.toFixed(2)}% (limit ${maxRegression.toFixed(2)}%)`,
      );
    }
  }

  const signaturesMatch =
    tokenCountMatches && tokenSignatureMatches && irHashMatches;
  const timingBaselineMatches =
    timingBaselineTokenCountMatches &&
    timingBaselineTokenSignatureMatches &&
    timingBaselineIrHashMatches;
  return {
    ok: signaturesMatch && timingBaselineMatches && failures.length === 0,
    tokenCountMatches,
    tokenSignatureMatches,
    irHashMatches,
    signaturesMatch,
    timingBaselineMatches,
    failures,
    phaseDeltas,
  };
}

export async function measureCompilePhases(options: {
  functionCount?: number;
  rounds?: number;
  warmups?: number;
  source?: string;
  fileName?: string;
  treeShakeTopLevelFunctions?: boolean;
} = {}): Promise<CompilePhaseBenchmarkResult> {
  const functionCount = options.functionCount ?? 5000;
  const rounds = options.rounds ?? 31;
  const warmups = options.warmups ?? 5;
  const source =
    options.source ?? generateSyntheticCompileSource(functionCount);
  const fileName = options.fileName ?? "perf_5k.bpl";
  const treeShakeTopLevelFunctions =
    options.treeShakeTopLevelFunctions === true;

  const lexTimings: number[] = [];
  const parseTimings: number[] = [];
  const typecheckTimings: number[] = [];
  const codegenTimings: number[] = [];
  const fullTimings: number[] = [];
  let tokenCount = 0;
  let tokenSignature = "";
  let irHash = "";
  const finalMeasuredRound = warmups + rounds - 1;

  for (let i = 0; i < warmups + rounds; i++) {
    const fullStart = performance.now();
    const lexStart = performance.now();
    const tokens = lexWithGrammar(source, fileName);
    const lexMs = performance.now() - lexStart;

    const parseStart = performance.now();
    const parser = new Parser(source, fileName, tokens);
    const program = parser.parse();
    const parseMs = performance.now() - parseStart;

    const typecheckStart = performance.now();
    const checker = new TypeChecker();
    checker.checkProgram(program);
    const errors = checker.getErrors();
    if (errors.length > 0) {
      throw new Error(errors.map((error) => error.message).join("\n"));
    }
    const typecheckMs = performance.now() - typecheckStart;

    const codegenStart = performance.now();
    const generator = new CodeGenerator({ treeShakeTopLevelFunctions });
    const ir = generator.generate(program, fileName);
    const codegenMs = performance.now() - codegenStart;
    const fullMs = performance.now() - fullStart;

    if (i >= warmups) {
      lexTimings.push(lexMs);
      parseTimings.push(parseMs);
      typecheckTimings.push(typecheckMs);
      codegenTimings.push(codegenMs);
      fullTimings.push(fullMs);
      if (i === finalMeasuredRound) {
        tokenCount = tokens.length;
        tokenSignature = hashTokens(tokens);
        irHash = hashString(ir);
      }
    }
  }

  return {
    mode: "phases",
    rounds,
    warmups,
    functionCount,
    sourceLength: source.length,
    treeShakeTopLevelFunctions,
    tokenCount,
    tokenSignature,
    irHash,
    lex: calculateCompilePhaseStats(lexTimings),
    parse: calculateCompilePhaseStats(parseTimings),
    typecheck: calculateCompilePhaseStats(typecheckTimings),
    codegen: calculateCompilePhaseStats(codegenTimings),
    full: calculateCompilePhaseStats(fullTimings),
  };
}

export function calculateCompilePhaseStats(
  samples: number[],
): CompilePhaseStats {
  if (samples.length === 0) {
    return { medianMs: 0, averageMs: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)]!,
    averageMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
  };
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashTokens(tokens: Token[]): string {
  return hashTokensForBenchmark(tokens);
}

export function hashTokensForBenchmark(tokens: Token[]): string {
  const hash = createHash("sha256");
  let chunk = "";

  for (const token of tokens) {
    chunk += `${String(token.type)}\0${token.lexeme}\0${String(token.line)}:${String(token.column)}\n`;
    if (chunk.length >= TOKEN_HASH_CHUNK_CHAR_LIMIT) {
      hash.update(chunk);
      chunk = "";
    }
  }

  if (chunk.length > 0) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function generateLegacyHugeFile(lines: number): string {
  let content = `
    extern printf(fmt: string, ...);

    struct Point { x: int, y: int }

    frame process(p: Point) ret int {
        return p.x + p.y;
    }
  `;

  for (let i = 0; i < lines; i++) {
    content += `
    frame func_${i}(a: int) ret int {
        local p: Point;
        p.x = a;
        p.y = ${i};
        return process(p) + ${i};
    }
    `;
  }

  content += `
    frame main() ret int {
        return func_0(1);
    }
  `;

  return content;
}

function measureCliCompilation(name: string, filePath: string): void {
  console.log(`Benchmarking: ${name}`);

  const start = process.hrtime.bigint();
  const result = spawnSync("bun", [COMPILER_PATH, filePath], {
    encoding: "utf-8",
  });
  const end = process.hrtime.bigint();

  if (result.status !== 0) {
    console.error(`Compilation failed for ${name}`);
    console.error(result.stderr);
    return;
  }

  const duration = Number(end - start) / 1e6;
  console.log(`  Time: ${duration.toFixed(2)} ms`);
}

async function main(): Promise<void> {
  const options = parseCompilationBenchmarkArgs(process.argv.slice(2));
  if (options.mode === "phases") {
    const result = await measureCompilePhases({
      functionCount: options.functions,
      rounds: options.rounds,
      warmups: options.warmups,
      treeShakeTopLevelFunctions: options.treeShakeTopLevelFunctions,
    });
    const comparison =
      options.compare !== undefined
        ? compareCompilePhaseBenchmarkResults(
            readCompilePhaseBenchmarkResult(options.compare),
            result,
            {
              timingBaseline:
                options.timingBaseline !== undefined
                  ? readCompilePhaseBenchmarkResult(options.timingBaseline)
                  : undefined,
              maxPhaseRegressionPercent:
                options.maxPhaseRegressionPercent,
              maxFullRegressionPercent: options.maxFullRegressionPercent,
              gatePhases: options.gatePhases,
            },
          )
        : undefined;
    if (options.json) {
      console.log(
        JSON.stringify(
          comparison === undefined ? result : { result, comparison },
          null,
          2,
        ),
      );
    } else {
      printPhaseResult(result);
      if (comparison !== undefined) {
        printPhaseComparison(comparison);
      }
    }
    if (comparison !== undefined && !comparison.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (options.compare !== undefined) {
    throw new Error("--compare is only supported with --mode phases");
  }
  if (options.timingBaseline !== undefined) {
    throw new Error(
      "--timing-baseline is only supported with --mode phases and --compare",
    );
  }

  runLegacyCompilationBenchmark();
}

function runLegacyCompilationBenchmark(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
  }

  console.log("Starting Compiler Performance Benchmark...");

  const helloPath = path.join(__dirname, "../examples/hello-world/main.bpl");
  measureCliCompilation("Hello World", helloPath);

  const compPath = path.join(
    __dirname,
    "../examples/comprehensive_features/main.bpl",
  );
  measureCliCompilation("Comprehensive Features", compPath);

  console.log("Generating synthetic large file (1000 functions)...");
  const hugePath = path.join(TEMP_DIR, "huge.bpl");
  fs.writeFileSync(hugePath, generateLegacyHugeFile(1000));
  measureCliCompilation("Synthetic Large (1000 funcs)", hugePath);

  console.log("Generating synthetic huge file (5000 functions)...");
  const massivePath = path.join(TEMP_DIR, "massive.bpl");
  fs.writeFileSync(massivePath, generateLegacyHugeFile(5000));
  measureCliCompilation("Synthetic Massive (5000 funcs)", massivePath);

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

function printPhaseResult(result: CompilePhaseBenchmarkResult): void {
  console.log(
    `BPL compile phases (${result.functionCount} functions, ${result.rounds} rounds, ${result.warmups} warmups)`,
  );
  console.log(`  source: ${result.sourceLength} bytes`);
  console.log(
    `  treeShakeTopLevelFunctions: ${result.treeShakeTopLevelFunctions}`,
  );
  console.log(`  tokens: ${result.tokenCount}`);
  console.log(`  tokenSignature: ${result.tokenSignature}`);
  console.log(`  irHash: ${result.irHash}`);
  printPhase("lex", result.lex);
  printPhase("parse", result.parse);
  printPhase("typecheck", result.typecheck);
  printPhase("codegen", result.codegen);
  printPhase("full", result.full);
}

function printPhase(name: string, stats: CompilePhaseStats): void {
  console.log(
    `  ${name.padEnd(9)} median ${stats.medianMs.toFixed(2)} ms  avg ${stats.averageMs.toFixed(2)} ms`,
  );
}

function printPhaseComparison(
  comparison: CompilePhaseBenchmarkComparison,
): void {
  console.log("");
  console.log("BPL compile phase comparison");
  console.log(
    `  signatures: ${comparison.signaturesMatch ? "unchanged" : "changed"}`,
  );
  for (const delta of comparison.phaseDeltas) {
    const sign = delta.deltaMs >= 0 ? "+" : "";
    console.log(
      `  ${delta.phase.padEnd(9)} ${delta.baselineMedianMs.toFixed(2)} ms -> ${delta.candidateMedianMs.toFixed(2)} ms  ${sign}${delta.deltaMs.toFixed(2)} ms  ${sign}${delta.deltaPercent.toFixed(2)}%`,
    );
  }
  if (comparison.failures.length > 0) {
    console.log("  failures:");
    for (const failure of comparison.failures) {
      console.log(`    - ${failure}`);
    }
  }
}

export function readCompilePhaseBenchmarkResult(
  filePath: string,
): CompilePhaseBenchmarkResult {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    parsed.result &&
    typeof parsed.result === "object"
  ) {
    return parsed.result as CompilePhaseBenchmarkResult;
  }

  return parsed as CompilePhaseBenchmarkResult;
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function parsePositiveInteger(
  value: string | undefined,
  optionName: string,
): number {
  const parsed = parseNonNegativeInteger(value, optionName);
  if (parsed === 0) {
    throw new Error(`${optionName} must be greater than 0`);
  }
  return parsed;
}

function parseNonNegativeInteger(
  value: string | undefined,
  optionName: string,
): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return Number(value);
}

function parseNonNegativeNumber(
  value: string | undefined,
  optionName: string,
): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative number`);
  }
  return parsed;
}

function parseGatePhases(value: string | undefined): CompilePhaseName[] {
  if (value === undefined || value.length === 0) {
    throw new Error("--gate-phases expects a comma-separated phase list");
  }

  const phases: CompilePhaseName[] = [];
  for (const rawPhase of value.split(",")) {
    const phase = rawPhase.trim();
    if (!isCompilePhaseName(phase)) {
      throw new Error(`--gate-phases contains unknown phase: ${phase}`);
    }
    if (!phases.includes(phase)) {
      phases.push(phase);
    }
  }

  return phases;
}

function isCompilePhaseName(value: string): value is CompilePhaseName {
  return COMPILE_PHASE_NAMES.includes(value as CompilePhaseName);
}

function printUsage(): void {
  console.log(`Usage: bun benchmark/measure_compilation.ts [options]

Options:
  --mode cli|phases     run legacy CLI benchmark or in-process phase benchmark
  --functions N         synthetic helper function count for --mode phases
  --rounds N            measured rounds for --mode phases
  --warmups N           warmup rounds for --mode phases
  --tree-shake-top-level-functions
                         measure codegen with opt-in top-level function tree shaking
  --compare FILE        compare phase results against a baseline JSON file
  --timing-baseline FILE
                         use a same-environment phase JSON file for timing deltas
  --gate-phases LIST    only apply threshold gates to comma-separated phases
                         while still reporting all phase deltas and validating signatures
  --max-phase-regression P
                         fail when lex/parse/typecheck/codegen median regresses by more than P percent
  --max-full-regression P
                         fail when full median regresses by more than P percent
  --json                print structured JSON for --mode phases
  --help                show this help
`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
