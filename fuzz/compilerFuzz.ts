import { spawnSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  type Stats,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { verifyLlvmFile } from "../compiler/common/LlvmVerifier";
import {
  findNonDirectoryPathComponent,
  findSymlinkedPathComponent,
} from "../compiler/common/PathSafety";

export const DEFAULT_MIN_TOKENS = 20;
export const DEFAULT_MAX_TOKENS = 100;

const KEYWORDS = [
  "global",
  "local",
  "const",
  "type",
  "frame",
  "static",
  "ret",
  "struct",
  "enum",
  "import",
  "from",
  "export",
  "extern",
  "asm",
  "as",
  "this",
  "loop",
  "if",
  "else",
  "break",
  "continue",
  "try",
  "catch",
  "return",
  "throw",
  "switch",
  "case",
  "default",
  "cast",
  "sizeof",
  "match",
  "func",
  "nullptr",
  "true",
  "false",
  "spec",
  "self",
];

const SYMBOLS = [
  "{",
  "}",
  "(",
  ")",
  "[",
  "]",
  ",",
  ":",
  ";",
  ".",
  "...",
  "?",
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "||",
  "&&",
  "|",
  "^",
  "&",
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "<<",
  ">>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "~",
  "->",
  "=>",
];

const TYPES = [
  "int",
  "float",
  "bool",
  "string",
  "void",
  "char",
  "u8",
  "u16",
  "u32",
  "u64",
];

export type FuzzStage = "lexer" | "parser" | "typecheck" | "codegen";
export type FuzzInputKind =
  | "structured"
  | "mutated"
  | "tokens"
  | "differential";
export type FuzzFailureKind = "crash" | "mismatch";
export type FuzzReplayMode =
  | "artifact"
  | "lexer"
  | "parser"
  | "typecheck"
  | "codegen"
  | "runtime"
  | "differential"
  | "sanitizer";

export interface DifferentialCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DifferentialMismatch {
  o0: DifferentialCommandResult;
  o3: DifferentialCommandResult;
}

export interface PipelineOutcome {
  ok: boolean;
  stage: FuzzStage;
  expectedError?: boolean;
  crash?: unknown;
  mismatch?: DifferentialMismatch;
  message?: string;
}

export interface CompilerPipelineOptions {
  skipImportResolution?: boolean;
  stopAfter?: FuzzStage;
}

export interface MutationOptions {
  seed: number;
  validSourceCount: number;
  mutationsPerSource: number;
}

export interface FuzzInput {
  seed: number;
  iteration: number;
  kind: FuzzInputKind;
  filePath: string;
  source: string;
}

export interface FuzzIterationContext {
  seed: number;
  iteration: number;
}

export type FuzzRunner = (
  source: string,
  filePath: string,
  input: FuzzInput,
) => PipelineOutcome;

export interface FuzzSeedSummary {
  seed: number;
  totalIterations: number;
  validPrograms: number;
  expectedErrors: number;
  crashes: number;
  mismatches: number;
}

export interface CrashArtifact {
  sourcePath: string;
  metadataPath: string;
}

export interface FuzzFailureArtifact extends CrashArtifact {
  failureKind: FuzzFailureKind;
}

export interface FuzzCampaignSummary {
  totalIterations: number;
  validPrograms: number;
  expectedErrors: number;
  crashes: number;
  mismatches: number;
  stageCounts: Record<FuzzStage, number>;
  seedSummaries: FuzzSeedSummary[];
  crashArtifacts: CrashArtifact[];
  failureArtifacts: FuzzFailureArtifact[];
}

export interface FuzzCampaignOptions {
  seeds: number[];
  iterationsPerSeed: number;
  crashDir?: string;
  enableDifferential?: boolean;
  minimizeFailures?: boolean;
  maxMinimizePasses?: number;
  progressInterval?: number;
  logProgress?: (message: string) => void;
  runner?: FuzzRunner;
  inputForIteration?: (context: FuzzIterationContext) => FuzzInput;
}

export interface FuzzCrashReplayOptions {
  sourcePath?: string;
  metadataPath?: string;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  expectedFailureKind?: FuzzFailureKind;
  runner?: FuzzRunner;
}

export interface FuzzCrashReplayResult {
  sourcePath: string;
  metadataPath?: string;
  metadata?: CrashMetadata;
  source: string;
  outcome: PipelineOutcome;
  crashed: boolean;
  failed: boolean;
  failureKind: FuzzFailureKind | undefined;
  signatureMatches: boolean;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  expectedFailureKind?: FuzzFailureKind;
}

export interface FuzzCrashMinimizeOptions {
  source: string;
  filePath?: string;
  expectedStage?: FuzzStage;
  expectedMessageIncludes?: string;
  expectedFailureKind?: FuzzFailureKind;
  runner?: FuzzRunner;
  maxPasses?: number;
}

export interface FuzzCrashMinimizeResult {
  originalSource: string;
  minimizedSource: string;
  originalTokenCount: number;
  minimizedTokenCount: number;
  attempts: number;
  changed: boolean;
  outcome: PipelineOutcome;
}

export interface FuzzReplayModeResult {
  mode: FuzzReplayMode;
  outcome: PipelineOutcome;
  failureKind: FuzzFailureKind | undefined;
}

export interface CrashMetadata {
  seed?: number;
  seedHex?: string;
  iteration?: number;
  pass?: number;
  kind?: FuzzInputKind;
  failureKind?: FuzzFailureKind;
  filePath?: string;
  sourcePath?: string;
  minimizedSourcePath?: string;
  stage?: FuzzStage;
  message?: string;
  mismatch?: DifferentialMismatch;
  failure?: {
    kind?: FuzzFailureKind;
    stage?: FuzzStage;
    message?: string;
  };
  optimizationLevels?: number[];
  expected?: DifferentialCommandResult & { optimizationLevel: number };
  actual?: DifferentialCommandResult & { optimizationLevel: number };
  replayCommand?: string;
  minimization?: {
    originalTokenCount?: number;
    minimizedTokenCount?: number;
    attempts?: number;
    changed?: boolean;
    error?: string;
  };
  promotedTo?: string;
}

const BPL_CLI = join(__dirname, "../index.ts");

export function createSeededRandom(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function getRandomInt(
  rng: () => number,
  min: number,
  max: number,
): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function getRandomElement<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function generateRandomIdentifier(rng: () => number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
  const len = getRandomInt(rng, 1, 10);
  let res = "";
  for (let i = 0; i < len; i++) {
    res += chars[Math.floor(rng() * chars.length)];
  }
  return res;
}

function generateRandomNumber(rng: () => number): string {
  return Math.floor(rng() * 1000).toString();
}

function generateRandomString(rng: () => number): string {
  return '"' + generateRandomIdentifier(rng) + '"';
}

function generateRandomToken(rng: () => number): string {
  const type = rng();
  if (type < 0.4) {
    return getRandomElement(rng, KEYWORDS);
  } else if (type < 0.7) {
    return getRandomElement(rng, SYMBOLS);
  } else if (type < 0.8) {
    return getRandomElement(rng, TYPES);
  } else if (type < 0.9) {
    return generateRandomIdentifier(rng);
  } else if (type < 0.95) {
    return generateRandomNumber(rng);
  } else {
    return generateRandomString(rng);
  }
}

export function generateRandomSource(
  rng: () => number,
  minTokens = DEFAULT_MIN_TOKENS,
  maxTokens = DEFAULT_MAX_TOKENS,
): string {
  const length = getRandomInt(rng, minTokens, maxTokens);
  const tokens: string[] = [];
  for (let i = 0; i < length; i++) {
    tokens.push(generateRandomToken(rng));
  }
  return tokens.join(" ");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function isCompilerErrorList(error: unknown): boolean {
  return (
    Array.isArray(error) &&
    error.length > 0 &&
    error.every((item) => item instanceof CompilerError)
  );
}

function isExpectedCompilerError(error: unknown): boolean {
  if (error instanceof CompilerError || isCompilerErrorList(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "CompilerError" ||
    error.message.includes("Syntax error") ||
    error.message.includes("Unexpected token") ||
    error.message.includes("Expected")
  );
}

export function runCompilerPipeline(
  source: string,
  filePath: string,
  options: CompilerPipelineOptions = {},
): PipelineOutcome {
  let stage: FuzzStage = "lexer";

  try {
    const tokens = lexWithGrammar(source, filePath);
    if (options.stopAfter === "lexer") {
      return { ok: true, stage };
    }

    stage = "parser";
    const parser = new Parser(source, filePath, tokens);
    const ast = parser.parse();
    if (options.stopAfter === "parser") {
      return { ok: true, stage };
    }

    stage = "typecheck";
    const typeChecker = new TypeChecker({
      collectAllErrors: false,
      skipImportResolution: options.skipImportResolution,
    });
    typeChecker.checkProgram(ast);

    const typeErrors = typeChecker.getErrors();
    if (typeErrors.length > 0) {
      return {
        ok: false,
        stage,
        expectedError: true,
        message: typeErrors.map((error) => error.message).join("\n"),
      };
    }
    if (options.stopAfter === "typecheck") {
      return { ok: true, stage };
    }

    stage = "codegen";
    const codeGenerator = new CodeGenerator();
    codeGenerator.generate(ast, filePath);

    return { ok: true, stage };
  } catch (error) {
    if (isExpectedCompilerError(error)) {
      return {
        ok: false,
        stage,
        expectedError: true,
        message: formatError(error),
      };
    }

    return {
      ok: false,
      stage,
      crash: error,
      message: formatError(error),
    };
  }
}

function generateArithmeticLoopSource(rng: () => number): string {
  const limit = getRandomInt(rng, 3, 8);
  const scale = getRandomInt(rng, 2, 7);
  const offset = getRandomInt(rng, 1, 9);
  const seedValue = getRandomInt(rng, 0, 30);

  return `
    frame helper(value: int) ret int {
      return (value * ${scale}) + ${offset};
    }

    frame main() ret int {
      local total: int = ${seedValue};
      local i: int = 0;

      loop (i < ${limit}) {
        total = total + helper(i);
        i = i + 1;
      }

      return total;
    }
  `;
}

function generateStructArraySource(rng: () => number): string {
  const left = getRandomInt(rng, 1, 9);
  const right = getRandomInt(rng, 1, 9);
  const values = Array.from({ length: 4 }, () => getRandomInt(rng, 1, 6));

  return `
    struct Pair {
      left: int,
      right: int,
    }

    frame bump(pair: *Pair, value: int) ret void {
      pair.left = pair.left + value;
      pair.right = pair.right + (value * 2);
    }

    frame main() ret int {
      local pair: Pair = Pair { left: ${left}, right: ${right} };
      local values: int[4] = [${values.join(", ")}];
      local i: int = 0;

      loop (i < 4) {
        bump(&pair, values[i]);
        i = i + 1;
      }

      return pair.left + pair.right;
    }
  `;
}

function generateEnumMatchSource(rng: () => number): string {
  const red = getRandomInt(rng, 1, 8);
  const green = getRandomInt(rng, 9, 16);
  const blue = getRandomInt(rng, 17, 24);
  const base = getRandomInt(rng, 1, 12);
  const variants = ["Red", "Green", "Blue"] as const;
  const first = getRandomElement(rng, variants);
  const second = getRandomElement(rng, variants);

  return `
    enum Color { Red, Green, Blue }

    frame score(color: Color, base: int) ret int {
      return match (color) {
        Color.Red => base + ${red},
        Color.Green => base + ${green},
        Color.Blue => base + ${blue},
      };
    }

    frame main() ret int {
      return score(Color.${first}, ${base}) + score(Color.${second}, ${base + 1});
    }
  `;
}

function generateGenericBranchSource(rng: () => number): string {
  const left = getRandomInt(rng, 2, 40);
  const right = getRandomInt(rng, 2, 40);
  const fallback = getRandomInt(rng, 1, 20);

  return `
    frame id<T>(value: T) ret T {
      return value;
    }

    frame distance(a: int, b: int) ret int {
      if (a > b) {
        return id<int>(a - b);
      }

      return id<int>((b - a) + ${fallback});
    }

    frame main() ret int {
      local left: int = id<int>(${left});
      local right: int = id<int>(${right});
      return distance(left, right);
    }
  `;
}

function generateLambdaCaptureSource(rng: () => number): string {
  const base = getRandomInt(rng, 1, 15);
  const input = getRandomInt(rng, 1, 15);
  const multiplier = getRandomInt(rng, 2, 5);

  return `
    frame main() ret int {
      local base: int = ${base};
      local transform: Lambda<int>(int) = |value: int| ret int {
        return (value * ${multiplier}) + base;
      };

      return transform(${input});
    }
  `;
}

function generateTupleSource(rng: () => number): string {
  const left = getRandomInt(rng, 1, 20);
  const right = getRandomInt(rng, 1, 20);

  return `
    frame main() ret int {
      local pair: (int, int) = (${left}, ${right});
      return pair.0 + pair.1;
    }
  `;
}

function generatePointerArraySource(rng: () => number): string {
  const firstRow = Array.from({ length: 3 }, () => getRandomInt(rng, 1, 20));
  const secondRow = Array.from({ length: 3 }, () => getRandomInt(rng, 1, 20));
  const row = getRandomInt(rng, 0, 1);
  const col = getRandomInt(rng, 0, 2);
  const replacement = getRandomInt(rng, 21, 60);

  return `
    type Row = int[3];

    frame readCell(rows: *Row, row: int, col: int) ret int {
      return (*(rows + row))[col];
    }

    frame writeCell(rows: *Row, row: int, col: int, value: int) ret void {
      (*(rows + row))[col] = value;
    }

    frame main() ret int {
      local matrix: int[2][3] = [
        [${firstRow.join(", ")}],
        [${secondRow.join(", ")}],
      ];
      local rows: *Row = &matrix[0];
      writeCell(rows, ${row}, ${col}, ${replacement});
      return readCell(rows, ${row}, ${col}) + readCell(rows, 0, 0);
    }
  `;
}

const STRUCTURED_GENERATORS = [
  generateArithmeticLoopSource,
  generateStructArraySource,
  generateEnumMatchSource,
  generateGenericBranchSource,
  generateLambdaCaptureSource,
  generateTupleSource,
  generatePointerArraySource,
];

const DIFFERENTIAL_RUNTIME_GENERATORS = [
  generateDifferentialArithmeticSource,
  generateDifferentialDivisionByZeroSource,
  generateDifferentialIntegerOverflowSource,
  generateDifferentialStructArraySource,
  generateDifferentialNullAccessSource,
  generateDifferentialEnumMatchSource,
  generateDifferentialBoundsFailureSource,
  generateDifferentialRecursiveSource,
  generateDifferentialLambdaSource,
  generateDifferentialTupleSource,
  generateDifferentialPointerArraySource,
];

export function generateStructuredValidSource(
  seed: number,
  index: number,
): string {
  const rng = createSeededRandom(mixSeed(seed, index));
  const generator =
    STRUCTURED_GENERATORS[index % STRUCTURED_GENERATORS.length]!;
  return generator(rng).trim();
}

export function generateStructuredValidSources(
  seed: number,
  count: number,
): string[] {
  return Array.from({ length: count }, (_, index) =>
    generateStructuredValidSource(seed, index),
  );
}

function generateDifferentialArithmeticSource(rng: () => number): string {
  const limit = getRandomInt(rng, 4, 9);
  const scale = getRandomInt(rng, 2, 8);
  const offset = getRandomInt(rng, 1, 11);
  const initial = getRandomInt(rng, 0, 20);

  return `
    extern printf(fmt: string, ...);

    frame main() ret int {
      local total: int = ${initial};
      local i: int = 0;

      loop (i < ${limit}) {
        if ((i % 2) == 0) {
          total = total + (i * ${scale}) + ${offset};
        } else {
          total = total - i - ${offset};
        }

        i = i + 1;
      }

      printf("diff arithmetic total=%d\\n", total);
      return 0;
    }
  `;
}

function generateDifferentialStructArraySource(rng: () => number): string {
  const left = getRandomInt(rng, 1, 9);
  const right = getRandomInt(rng, 2, 12);
  const values = Array.from({ length: 4 }, () => getRandomInt(rng, 1, 5));

  return `
    extern printf(fmt: string, ...);

    struct Pair {
      left: int,
      right: int,
    }

    frame bump(pair: *Pair, value: int) ret void {
      pair.left = pair.left + value;
      pair.right = pair.right + (value * 2);
    }

    frame main() ret int {
      local pair: Pair = Pair { left: ${left}, right: ${right} };
      local values: int[4] = [${values.join(", ")}];
      local i: int = 0;

      loop (i < 4) {
        bump(&pair, values[i]);
        i = i + 1;
      }

      printf("diff pair left=%d right=%d\\n", pair.left, pair.right);
      return 0;
    }
  `;
}

function generateDifferentialDivisionByZeroSource(_rng: () => number): string {
  return `
    frame main() ret int {
      local zero: int = 0;
      return 10 / zero;
    }
  `;
}

function generateDifferentialIntegerOverflowSource(_rng: () => number): string {
  return `
    frame main() ret int {
      local min: int = -2147483648;
      local negativeOne: int = -1;
      return min / negativeOne;
    }
  `;
}

function generateDifferentialNullAccessSource(_rng: () => number): string {
  return `
    struct Node {
      value: int,
    }

    frame main() ret int {
      local node: *Node = nullptr;
      return node.value;
    }
  `;
}

function generateDifferentialBoundsFailureSource(_rng: () => number): string {
  return `
    frame main() ret int {
      local values: int[2] = [10, 20];
      local index: int = 2;
      return values[index];
    }
  `;
}

function generateDifferentialEnumMatchSource(rng: () => number): string {
  const base = getRandomInt(rng, 1, 20);
  const red = getRandomInt(rng, 1, 8);
  const green = getRandomInt(rng, 9, 16);
  const blue = getRandomInt(rng, 17, 24);
  const variants = ["Red", "Green", "Blue"] as const;
  const first = getRandomElement(rng, variants);
  const second = getRandomElement(rng, variants);

  return `
    extern printf(fmt: string, ...);

    enum Color { Red, Green, Blue }

    frame score(color: Color, base: int) ret int {
      return match (color) {
        Color.Red => base + ${red},
        Color.Green => base + ${green},
        Color.Blue => base + ${blue},
      };
    }

    frame main() ret int {
      local total: int = score(Color.${first}, ${base}) + score(Color.${second}, ${base + 1});
      printf("diff enum total=%d\\n", total);
      return 0;
    }
  `;
}

function generateDifferentialRecursiveSource(rng: () => number): string {
  const input = getRandomInt(rng, 4, 7);

  return `
    extern printf(fmt: string, ...);

    frame recur(value: int, acc: int) ret int {
      if (value <= 0) {
        return acc;
      }

      if ((value % 2) == 0) {
        return recur(value - 1, acc + (value * 2));
      }

      return recur(value - 1, acc + value + 1);
    }

    frame main() ret int {
      local total: int = recur(${input}, 3);
      printf("diff recursive total=%d\\n", total);
      return 0;
    }
  `;
}

function generateDifferentialLambdaSource(rng: () => number): string {
  const base = getRandomInt(rng, 1, 15);
  const input = getRandomInt(rng, 1, 15);
  const multiplier = getRandomInt(rng, 2, 5);

  return `
    extern printf(fmt: string, ...);

    frame main() ret int {
      local base: int = ${base};
      local transform: Lambda<int>(int) = |value: int| ret int {
        return (value * ${multiplier}) + base;
      };
      local total: int = transform(${input});
      printf("diff lambda total=%d\\n", total);
      return 0;
    }
  `;
}

function generateDifferentialTupleSource(rng: () => number): string {
  const left = getRandomInt(rng, 1, 20);
  const right = getRandomInt(rng, 1, 20);

  return `
    extern printf(fmt: string, ...);

    frame main() ret int {
      local pair: (int, int) = (${left}, ${right});
      local total: int = pair.0 + pair.1;
      printf("diff tuple total=%d\\n", total);
      return 0;
    }
  `;
}

function generateDifferentialPointerArraySource(rng: () => number): string {
  const firstRow = Array.from({ length: 3 }, () => getRandomInt(rng, 1, 20));
  const secondRow = Array.from({ length: 3 }, () => getRandomInt(rng, 1, 20));
  const row = getRandomInt(rng, 0, 1);
  const col = getRandomInt(rng, 0, 2);
  const replacement = getRandomInt(rng, 21, 60);

  return `
    extern printf(fmt: string, ...);

    type Row = int[3];

    frame readCell(rows: *Row, row: int, col: int) ret int {
      return (*(rows + row))[col];
    }

    frame writeCell(rows: *Row, row: int, col: int, value: int) ret void {
      (*(rows + row))[col] = value;
    }

    frame main() ret int {
      local matrix: int[2][3] = [
        [${firstRow.join(", ")}],
        [${secondRow.join(", ")}],
      ];
      local rows: *Row = &matrix[0];
      writeCell(rows, ${row}, ${col}, ${replacement});
      local cell: int = readCell(rows, ${row}, ${col});
      local diagonal: int = readCell(rows, 0, 0) + readCell(rows, 1, 1);
      printf("diff pointer-array cell=%d diag=%d\\n", cell, diagonal);
      return 0;
    }
  `;
}

export function generateDifferentialRuntimeSource(
  seed: number,
  index: number,
): string {
  const rng = createSeededRandom(mixSeed(seed ^ 0xd1ff0, index));
  const generator =
    DIFFERENTIAL_RUNTIME_GENERATORS[
      index % DIFFERENTIAL_RUNTIME_GENERATORS.length
    ]!;
  return generator(rng).trim();
}

const TOKEN_PATTERN =
  /"[^"\\]*(?:\\.[^"\\]*)*"|[A-Za-z_][A-Za-z0-9_]*|\d+\.\d+|\d+|==|!=|<=|>=|\|\||&&|\+=|-=|\*=|\/=|%=|<<|>>|=>|->|\.\.\.|[{}()[\],:;.?=+\-*/%&|^!~<>]/g;

export function tokenizeForMutation(source: string): string[] {
  return source.match(TOKEN_PATTERN) ?? [];
}

export function mutateTokens(
  tokens: readonly string[],
  rng: () => number,
): string[] {
  const mutated = [...tokens];
  const mutationCount = getRandomInt(rng, 1, 3);

  for (let i = 0; i < mutationCount; i++) {
    const operation = getRandomInt(rng, 0, 3);
    const index = getRandomInt(rng, 0, Math.max(mutated.length - 1, 0));

    if (operation === 0 && mutated.length > 1) {
      mutated.splice(index, 1);
    } else if (operation === 1) {
      mutated.splice(index, 0, generateRandomToken(rng));
    } else if (operation === 2 && mutated.length > 0) {
      mutated[index] = generateRandomToken(rng);
    } else if (mutated.length > 0) {
      mutated.splice(index, 0, mutated[index]!);
    }
  }

  return mutated;
}

export function generateMutatedStructuredSource(
  seed: number,
  iteration: number,
): string {
  const baseSource = generateStructuredValidSource(
    seed ^ 0xa5a5a5a5,
    iteration,
  );
  const rng = createSeededRandom(mixSeed(seed ^ 0xbad5eed, iteration));
  return mutateTokens(tokenizeForMutation(baseSource), rng).join(" ");
}

export function generateMutatedStructuredSources(
  options: MutationOptions,
): string[] {
  const mutatedSources: string[] = [];

  for (
    let sourceIndex = 0;
    sourceIndex < options.validSourceCount;
    sourceIndex++
  ) {
    const tokens = tokenizeForMutation(
      generateStructuredValidSource(options.seed ^ 0xa5a5a5a5, sourceIndex),
    );

    for (
      let mutationIndex = 0;
      mutationIndex < options.mutationsPerSource;
      mutationIndex++
    ) {
      const rng = createSeededRandom(
        mixSeed(options.seed ^ sourceIndex, mutationIndex),
      );
      mutatedSources.push(mutateTokens(tokens, rng).join(" "));
    }
  }

  return mutatedSources;
}

export interface GenerateFuzzInputOptions {
  enableDifferential?: boolean;
}

export function generateFuzzInput(
  seed: number,
  iteration: number,
  options: GenerateFuzzInputOptions = {},
): FuzzInput {
  const lane = iteration % (options.enableDifferential ? 8 : 6);
  const kind: FuzzInputKind =
    options.enableDifferential && (lane === 0 || lane === 4)
      ? "differential"
      : lane === 1 || lane === 5
        ? "structured"
        : lane === 2 || lane === 6
          ? "mutated"
          : "tokens";
  let source: string;

  if (kind === "differential") {
    source = generateDifferentialRuntimeSource(seed, Math.floor(iteration / 4));
  } else if (kind === "structured") {
    source = generateStructuredValidSource(seed, iteration);
  } else if (kind === "mutated") {
    source = generateMutatedStructuredSource(seed, iteration);
  } else {
    source = generateRandomSource(createSeededRandom(mixSeed(seed, iteration)));
  }

  return {
    seed,
    iteration,
    kind,
    source,
    filePath: `fuzz_seed_${seed.toString(16)}_iter_${iteration}_${kind}.bpl`,
  };
}

export function runFuzzCampaign(
  options: FuzzCampaignOptions,
): FuzzCampaignSummary {
  validateFuzzCampaignOptions(options);

  const runner = options.runner ?? defaultFuzzRunner;
  const inputForIteration =
    options.inputForIteration ??
    ((context: FuzzIterationContext) =>
      generateFuzzInput(context.seed, context.iteration, {
        enableDifferential: options.enableDifferential,
      }));
  const stageCounts = createStageCounts();
  const seedSummaries: FuzzSeedSummary[] = [];
  const crashArtifacts: CrashArtifact[] = [];
  const failureArtifacts: FuzzFailureArtifact[] = [];
  let validPrograms = 0;
  let expectedErrors = 0;
  let crashes = 0;
  let mismatches = 0;

  for (const seed of options.seeds) {
    const seedSummary: FuzzSeedSummary = {
      seed,
      totalIterations: 0,
      validPrograms: 0,
      expectedErrors: 0,
      crashes: 0,
      mismatches: 0,
    };

    for (
      let iteration = 0;
      iteration < options.iterationsPerSeed;
      iteration++
    ) {
      if (
        options.progressInterval &&
        iteration > 0 &&
        iteration % options.progressInterval === 0
      ) {
        options.logProgress?.(
          `seed ${formatSeed(seed)} iteration ${iteration}/${options.iterationsPerSeed}`,
        );
      }

      const input = inputForIteration({ seed, iteration });
      const outcome = runner(input.source, input.filePath, input);
      stageCounts[outcome.stage]++;
      seedSummary.totalIterations++;

      if (outcome.ok) {
        validPrograms++;
        seedSummary.validPrograms++;
      } else if (outcome.expectedError === true) {
        expectedErrors++;
        seedSummary.expectedErrors++;
      } else if (outcome.mismatch !== undefined) {
        mismatches++;
        seedSummary.mismatches++;

        if (options.crashDir) {
          failureArtifacts.push(
            writeFailureArtifact(options.crashDir, input, outcome, {
              runner,
              minimizeFailures: options.minimizeFailures,
              maxMinimizePasses: options.maxMinimizePasses,
            }),
          );
        }
      } else {
        crashes++;
        seedSummary.crashes++;

        if (options.crashDir) {
          const artifact = writeFailureArtifact(
            options.crashDir,
            input,
            outcome,
            {
              runner,
              minimizeFailures: options.minimizeFailures,
              maxMinimizePasses: options.maxMinimizePasses,
            },
          );
          failureArtifacts.push(artifact);
          crashArtifacts.push(artifact);
        }
      }
    }

    seedSummaries.push(seedSummary);
  }

  return {
    totalIterations: options.seeds.length * options.iterationsPerSeed,
    validPrograms,
    expectedErrors,
    crashes,
    mismatches,
    stageCounts,
    seedSummaries,
    crashArtifacts,
    failureArtifacts,
  };
}

function validateFuzzCampaignOptions(options: FuzzCampaignOptions): void {
  validateFuzzCampaignSeeds(options.seeds);
  validatePositiveInteger(options.iterationsPerSeed, "iterationsPerSeed");

  if (options.progressInterval !== undefined) {
    validatePositiveInteger(options.progressInterval, "progressInterval");
  }

  if (options.maxMinimizePasses !== undefined) {
    validatePositiveInteger(options.maxMinimizePasses, "maxMinimizePasses");
  }
}

function validateFuzzCampaignSeeds(seeds: number[]): void {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new Error("seeds must contain at least one seed.");
  }

  if (
    seeds.some(
      (seed) =>
        !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff,
    )
  ) {
    throw new Error(
      `seeds must be unsigned 32-bit integers, got ${formatNumberList(seeds)}.`,
    );
  }
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}.`);
  }
}

function formatNumberList(values: number[]): string {
  return `[${values.map((value) => `${value}`).join(", ")}]`;
}

export function replayFuzzFailureArtifact(
  options: FuzzCrashReplayOptions,
): FuzzCrashReplayResult {
  const metadata = options.metadataPath
    ? readCrashMetadata(options.metadataPath)
    : undefined;
  const sourcePath = resolveCrashSourcePath(options, metadata);

  const source = readFileSync(sourcePath, "utf8");
  const runner = options.runner ?? defaultFuzzRunner;
  const input = inputFromCrashMetadata(source, sourcePath, metadata);
  const outcome = runner(source, metadata?.filePath ?? sourcePath, input);
  const expectedStage = options.expectedStage ?? metadata?.stage;
  const expectedMessageIncludes = options.expectedMessageIncludes;
  const expectedFailureKind =
    options.expectedFailureKind ?? metadata?.failureKind;
  const failureKind = inferFailureKind(outcome);

  return {
    sourcePath,
    metadataPath: options.metadataPath,
    metadata,
    source,
    outcome,
    crashed: failureKind === "crash",
    failed: isFailureOutcome(outcome),
    failureKind,
    signatureMatches: failureMatchesSignature(outcome, {
      expectedStage,
      expectedMessageIncludes,
      expectedFailureKind,
    }),
    expectedStage,
    expectedMessageIncludes,
    expectedFailureKind,
  };
}

export function replayFuzzCrashArtifact(
  options: FuzzCrashReplayOptions,
): FuzzCrashReplayResult {
  return replayFuzzFailureArtifact({
    ...options,
    expectedFailureKind: options.expectedFailureKind ?? "crash",
  });
}

export function runFuzzReplayMode(
  source: string,
  filePath: string,
  mode: FuzzReplayMode,
  metadata: CrashMetadata = {},
): FuzzReplayModeResult {
  const input = inputFromCrashMetadata(source, filePath, metadata);
  const outcome =
    mode === "artifact"
      ? defaultFuzzRunner(source, filePath, input)
      : mode === "lexer" ||
          mode === "parser" ||
          mode === "typecheck" ||
          mode === "codegen"
        ? runCompilerPipeline(source, filePath, {
            skipImportResolution: true,
            stopAfter: mode,
          })
        : mode === "runtime"
          ? runBplRuntimePipeline(source, filePath, 0, false)
          : mode === "sanitizer"
            ? runBplRuntimePipeline(source, filePath, 0, true)
            : runBplDifferentialPipeline(source, filePath);

  return {
    mode,
    outcome,
    failureKind: inferFailureKind(outcome),
  };
}

export function minimizeFuzzFailure(
  options: FuzzCrashMinimizeOptions,
): FuzzCrashMinimizeResult {
  const runner = options.runner ?? defaultFuzzRunner;
  const filePath = options.filePath ?? "fuzz_minimize.bpl";
  const input = inputFromCrashMetadata(options.source, filePath);
  const originalOutcome = runner(options.source, filePath, input);
  const signature = {
    expectedStage: options.expectedStage ?? originalOutcome.stage,
    expectedMessageIncludes: options.expectedMessageIncludes,
    expectedFailureKind:
      options.expectedFailureKind ?? inferFailureKind(originalOutcome),
  };

  if (!failureMatchesSignature(originalOutcome, signature)) {
    throw new Error(
      "Original source does not reproduce the requested fuzz failure signature.",
    );
  }

  let tokens = tokenizeForMutation(options.source);
  const originalTokenCount = tokens.length;
  let attempts = 0;
  let changed = false;
  let outcome = originalOutcome;

  if (tokens.length === 0) {
    return {
      originalSource: options.source,
      minimizedSource: options.source,
      originalTokenCount,
      minimizedTokenCount: 0,
      attempts,
      changed: false,
      outcome,
    };
  }

  let chunkSize = Math.max(1, Math.floor(tokens.length / 2));
  let passes = 0;
  const maxPasses = options.maxPasses ?? Number.POSITIVE_INFINITY;

  while (chunkSize >= 1 && passes < maxPasses) {
    passes++;
    let changedThisPass = false;

    for (let index = 0; index < tokens.length; ) {
      const candidate = [
        ...tokens.slice(0, index),
        ...tokens.slice(index + chunkSize),
      ];

      if (candidate.length === 0) {
        index += chunkSize;
        continue;
      }

      attempts++;
      const candidateSource = candidate.join(" ");
      const candidateInput = inputFromCrashMetadata(candidateSource, filePath);
      const candidateOutcome = runner(
        candidateSource,
        filePath,
        candidateInput,
      );

      if (failureMatchesSignature(candidateOutcome, signature)) {
        tokens = candidate;
        outcome = candidateOutcome;
        changed = true;
        changedThisPass = true;
      } else {
        index += chunkSize;
      }
    }

    if (changedThisPass) {
      chunkSize = Math.min(
        chunkSize,
        Math.max(1, Math.floor(tokens.length / 2)),
      );
    } else if (chunkSize === 1) {
      break;
    } else {
      chunkSize = Math.max(1, Math.floor(chunkSize / 2));
    }
  }

  const minimizedSource = changed ? tokens.join(" ") : options.source;

  return {
    originalSource: options.source,
    minimizedSource,
    originalTokenCount,
    minimizedTokenCount: tokens.length,
    attempts,
    changed,
    outcome,
  };
}

export function minimizeFuzzCrash(
  options: FuzzCrashMinimizeOptions,
): FuzzCrashMinimizeResult {
  return minimizeFuzzFailure({
    ...options,
    expectedFailureKind: options.expectedFailureKind ?? "crash",
  });
}

interface WriteFailureArtifactOptions {
  runner: FuzzRunner;
  minimizeFailures?: boolean;
  maxMinimizePasses?: number;
}

function writeFailureArtifact(
  crashDir: string,
  input: FuzzInput,
  outcome: PipelineOutcome,
  options: WriteFailureArtifactOptions,
): FuzzFailureArtifact {
  assertWritableCrashArtifactDirectory(crashDir);
  mkdirSync(crashDir, { recursive: true });
  assertWritableCrashArtifactDirectory(crashDir);

  const failureKind = inferFailureKind(outcome) ?? "crash";
  const baseName = [
    failureKind === "mismatch" ? "mismatch" : "crash",
    `seed-${input.seed.toString(16)}`,
    `iter-${input.iteration}`,
    input.kind,
  ].join("_");
  const sourcePath = join(crashDir, `${baseName}.bpl`);
  const metadataPath = join(crashDir, `${baseName}.json`);
  const metadata = createFailureMetadata(
    input,
    outcome,
    failureKind,
    sourcePath,
    metadataPath,
  );

  writeFileSync(sourcePath, input.source);
  if (options.minimizeFailures) {
    const minimizedSourcePath = join(crashDir, `${baseName}.min.bpl`);
    metadata.minimizedSourcePath = minimizedSourcePath;

    try {
      const minimized = minimizeFuzzFailure({
        source: input.source,
        filePath: input.filePath,
        expectedStage: outcome.stage,
        expectedFailureKind: failureKind,
        runner: options.runner,
        maxPasses: options.maxMinimizePasses,
      });

      writeFileSync(minimizedSourcePath, minimized.minimizedSource);
      metadata.minimization = {
        originalTokenCount: minimized.originalTokenCount,
        minimizedTokenCount: minimized.minimizedTokenCount,
        attempts: minimized.attempts,
        changed: minimized.changed,
      };
    } catch (error) {
      metadata.minimization = { error: formatError(error) };
    }
  }

  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  return { sourcePath, metadataPath, failureKind };
}

function assertWritableCrashArtifactDirectory(crashDir: string): void {
  const artifactDir = resolve(crashDir);
  const symlinkedComponent = findSymlinkedPathComponent(artifactDir);
  if (symlinkedComponent) {
    if (symlinkedComponent === artifactDir) {
      throw new Error(
        `Fuzz crash artifact directory is a symbolic link: ${symlinkedComponent}`,
      );
    }

    throw new Error(
      `Fuzz crash artifact directory parent contains a symbolic link: ${symlinkedComponent}`,
    );
  }

  const nonDirectoryComponent = findNonDirectoryPathComponent(artifactDir);
  if (nonDirectoryComponent) {
    throw new Error(
      `Fuzz crash artifact directory parent is not a directory: ${nonDirectoryComponent}`,
    );
  }
}

function createFailureMetadata(
  input: FuzzInput,
  outcome: PipelineOutcome,
  failureKind: FuzzFailureKind,
  sourcePath: string,
  metadataPath: string,
): CrashMetadata {
  const metadata: CrashMetadata = {
    seed: input.seed,
    seedHex: formatSeed(input.seed),
    iteration: input.iteration,
    pass: input.iteration,
    kind: input.kind,
    failureKind,
    filePath: input.filePath,
    sourcePath,
    stage: outcome.stage,
    message: outcome.message,
    failure: {
      kind: failureKind,
      stage: outcome.stage,
      message: outcome.message,
    },
    replayCommand: `bun run fuzz:replay -- --metadata ${metadataPath}`,
  };

  if (outcome.mismatch !== undefined) {
    metadata.mismatch = outcome.mismatch;
    metadata.optimizationLevels = [0, 3];
    metadata.expected = {
      optimizationLevel: 0,
      ...outcome.mismatch.o0,
    };
    metadata.actual = {
      optimizationLevel: 3,
      ...outcome.mismatch.o3,
    };
  }

  return metadata;
}

function createStageCounts(): Record<FuzzStage, number> {
  return {
    lexer: 0,
    parser: 0,
    typecheck: 0,
    codegen: 0,
  };
}

export function runBplDifferentialPipeline(
  source: string,
  filePath: string,
): PipelineOutcome {
  const verifierOutcome = runBplLlvmVerifierPipeline(source, filePath);
  if (!verifierOutcome.ok) {
    return verifierOutcome;
  }

  const dir = mkdtempSync(join(tmpdir(), "bpl-fuzz-diff-"));
  const sourcePath = join(dir, "main.bpl");

  try {
    writeFileSync(sourcePath, source);
    const o0 = runBplCommand(sourcePath, dir, 0);
    const o3 = runBplCommand(sourcePath, dir, 3);
    const equivalentRuntimeFailure = areEquivalentRuntimeFailures(o0, o3);
    const mismatch = createMismatch(o0, o3);

    if (mismatch !== undefined) {
      return {
        ok: false,
        stage: "codegen",
        message: "O0/O3 behavior mismatch",
        mismatch,
      };
    }

    if (o0.exitCode !== 0 && !equivalentRuntimeFailure) {
      return {
        ok: false,
        stage: "codegen",
        message: [
          `BPL program failed at both optimization levels for ${filePath}`,
          o0.stderr ? `stderr:\n${o0.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }

    return { ok: true, stage: "codegen" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runBplLlvmVerifierPipeline(
  source: string,
  filePath: string,
): PipelineOutcome {
  const dir = mkdtempSync(join(tmpdir(), "bpl-fuzz-llvm-"));
  const sourcePath = join(dir, "main.bpl");

  try {
    writeFileSync(sourcePath, source);

    for (const optimizationLevel of [0, 3] as const) {
      const irPath = join(dir, `main-O${optimizationLevel}.ll`);
      const build = runBplBuildLlvmCommand(
        sourcePath,
        irPath,
        dir,
        optimizationLevel,
      );

      if (build.exitCode !== 0) {
        return {
          ok: false,
          stage: "codegen",
          message: [
            `BPL failed to emit LLVM IR for ${filePath} at -O${optimizationLevel}`,
            build.stdout ? `stdout:\n${build.stdout}` : "",
            build.stderr ? `stderr:\n${build.stderr}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }

      const verifier = verifyLlvmFile(irPath, { cwd: dir });
      if (verifier.exitCode !== 0) {
        return {
          ok: false,
          stage: "codegen",
          message: [
            `LLVM verifier (${verifier.tool}) rejected ${filePath} at -O${optimizationLevel}`,
            verifier.args.length > 0
              ? `command: ${verifier.tool} ${verifier.args.join(" ")}`
              : "",
            verifier.stdout ? `stdout:\n${verifier.stdout}` : "",
            verifier.stderr ? `stderr:\n${verifier.stderr}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }
    }

    return { ok: true, stage: "codegen" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runBplRuntimePipeline(
  source: string,
  filePath: string,
  optimizationLevel: 0 | 3 = 0,
  sanitizer = false,
): PipelineOutcome {
  const dir = mkdtempSync(join(tmpdir(), "bpl-fuzz-runtime-"));
  const sourcePath = join(dir, "main.bpl");

  try {
    writeFileSync(sourcePath, source);

    const result = runBplCommand(sourcePath, dir, optimizationLevel, sanitizer);

    if (result.exitCode === 0) {
      return { ok: true, stage: "codegen" };
    }

    return {
      ok: false,
      stage: "codegen",
      message: [
        `BPL runtime mode failed for ${filePath} at -O${optimizationLevel}`,
        sanitizer ? "sanitizers: address,undefined" : "",
        result.stdout ? `stdout:\n${result.stdout}` : "",
        result.stderr ? `stderr:\n${result.stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runBplCommand(
  sourcePath: string,
  cwd: string,
  optimizationLevel: 0 | 3,
  sanitizer = false,
): DifferentialCommandResult {
  const args = [BPL_CLI, "run", sourcePath, "-O", String(optimizationLevel)];
  if (sanitizer) {
    args.splice(1, 0, "--clang-flag=-fsanitize=address,undefined");
  }

  const result = spawnSync("bun", args, {
    cwd,
    encoding: "utf8",
    timeout: 30000,
    env: sanitizer
      ? {
          ...process.env,
          ASAN_OPTIONS: [
            process.env.ASAN_OPTIONS,
            "detect_leaks=0",
            "halt_on_error=1",
          ]
            .filter(Boolean)
            .join(":"),
          UBSAN_OPTIONS: [
            process.env.UBSAN_OPTIONS,
            "halt_on_error=1",
            "print_stacktrace=1",
          ]
            .filter(Boolean)
            .join(":"),
        }
      : process.env,
    maxBuffer: 1024 * 1024 * 16,
  });

  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: result.status ?? -1,
  };
}

function runBplBuildLlvmCommand(
  sourcePath: string,
  irPath: string,
  cwd: string,
  optimizationLevel: 0 | 3,
): DifferentialCommandResult {
  const result = spawnSync(
    "bun",
    [
      BPL_CLI,
      "build",
      sourcePath,
      "-O",
      String(optimizationLevel),
      "--emit",
      "llvm",
      "-o",
      irPath,
    ],
    {
      cwd,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 16,
    },
  );

  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? result.error?.message ?? ""),
    exitCode: result.status ?? -1,
  };
}

function createMismatch(
  o0: DifferentialCommandResult,
  o3: DifferentialCommandResult,
): DifferentialMismatch | undefined {
  if (
    o0.exitCode === o3.exitCode &&
    o0.stdout === o3.stdout &&
    o0.stderr === o3.stderr
  ) {
    return undefined;
  }

  if (areEquivalentRuntimeFailures(o0, o3)) {
    return undefined;
  }

  return { o0, o3 };
}

type RuntimeFailureKind =
  | "division-by-zero"
  | "integer-overflow"
  | "null-access"
  | "index-out-of-bounds"
  | "stack-overflow"
  | "native-signal"
  | "sanitizer";

interface RuntimeFailureSignature {
  kind: RuntimeFailureKind;
  stdout: string;
}

const ANSI_ESCAPE_PATTERN = /\x1B\[[0-9;]*m/g;

function areEquivalentRuntimeFailures(
  o0: DifferentialCommandResult,
  o3: DifferentialCommandResult,
): boolean {
  const left = classifyRuntimeFailure(o0);
  const right = classifyRuntimeFailure(o3);

  return (
    left !== undefined &&
    right !== undefined &&
    left.kind === right.kind &&
    left.stdout === right.stdout
  );
}

function classifyRuntimeFailure(
  result: DifferentialCommandResult,
): RuntimeFailureSignature | undefined {
  if (result.exitCode === 0) {
    return undefined;
  }

  const output = `${result.stderr}\n${result.stdout}`
    .replace(ANSI_ESCAPE_PATTERN, "")
    .toUpperCase();

  if (output.includes("DIVISION BY ZERO")) {
    return { kind: "division-by-zero", stdout: result.stdout };
  }
  if (output.includes("INTEGER OVERFLOW")) {
    return { kind: "integer-overflow", stdout: result.stdout };
  }
  if (output.includes("NULL POINTER ACCESS")) {
    return { kind: "null-access", stdout: result.stdout };
  }
  if (output.includes("INDEX OUT OF BOUNDS")) {
    return { kind: "index-out-of-bounds", stdout: result.stdout };
  }
  if (output.includes("STACK OVERFLOW")) {
    return { kind: "stack-overflow", stdout: result.stdout };
  }
  if (
    output.includes("SIGSEGV") ||
    output.includes("SIGFPE") ||
    output.includes("SIGABRT") ||
    output.includes("SIGBUS") ||
    output.includes("SIGILL")
  ) {
    return { kind: "native-signal", stdout: result.stdout };
  }
  if (
    output.includes("ERROR: ADDRESSSANITIZER") ||
    output.includes("UNDEFINEDBEHAVIORSANITIZER") ||
    output.includes("RUNTIME ERROR:")
  ) {
    return { kind: "sanitizer", stdout: result.stdout };
  }

  return undefined;
}

function defaultFuzzRunner(
  source: string,
  filePath: string,
  input: FuzzInput,
): PipelineOutcome {
  if (input.kind === "differential") {
    return runBplDifferentialPipeline(source, filePath);
  }

  return defaultPipelineRunner(source, filePath);
}

function defaultPipelineRunner(
  source: string,
  filePath: string,
): PipelineOutcome {
  return runCompilerPipeline(source, filePath, { skipImportResolution: true });
}

function inputFromCrashMetadata(
  source: string,
  sourcePath: string,
  metadata: CrashMetadata = {},
): FuzzInput {
  return {
    seed: metadata.seed ?? 0,
    iteration: metadata.iteration ?? 0,
    kind: metadata.kind ?? "tokens",
    filePath: metadata.filePath ?? sourcePath,
    source,
  };
}

function readCrashMetadata(metadataPath: string): CrashMetadata {
  return JSON.parse(readFileSync(metadataPath, "utf8")) as CrashMetadata;
}

function tryLstat(filePath: string): Stats | null {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }
    throw error;
  }
}

function resolveCrashSourcePath(
  options: FuzzCrashReplayOptions,
  metadata: CrashMetadata | undefined,
): string {
  const candidates = [
    options.sourcePath,
    metadata?.minimizedSourcePath,
    options.metadataPath
      ? siblingSourcePath(options.metadataPath, ".min.bpl")
      : undefined,
    metadata?.sourcePath,
    options.metadataPath
      ? siblingSourcePath(options.metadataPath, ".bpl")
      : undefined,
  ].filter((candidate): candidate is string => candidate !== undefined);

  if (candidates.length === 0) {
    throw new Error("sourcePath is required when metadata has no sourcePath.");
  }

  return (
    candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
  );
}

function siblingSourcePath(metadataPath: string, extension: string): string {
  return metadataPath.endsWith(".json")
    ? metadataPath.slice(0, -".json".length) + extension
    : `${metadataPath}${extension}`;
}

function isFailureOutcome(outcome: PipelineOutcome): boolean {
  return outcome.ok === false && outcome.expectedError !== true;
}

function inferFailureKind(
  outcome: PipelineOutcome,
): FuzzFailureKind | undefined {
  if (!isFailureOutcome(outcome)) {
    return undefined;
  }

  return outcome.mismatch !== undefined ? "mismatch" : "crash";
}

function failureMatchesSignature(
  outcome: PipelineOutcome,
  signature: {
    expectedStage?: FuzzStage;
    expectedMessageIncludes?: string;
    expectedFailureKind?: FuzzFailureKind;
  },
): boolean {
  if (!isFailureOutcome(outcome)) {
    return false;
  }

  if (
    signature.expectedFailureKind !== undefined &&
    inferFailureKind(outcome) !== signature.expectedFailureKind
  ) {
    return false;
  }

  if (
    signature.expectedStage !== undefined &&
    outcome.stage !== signature.expectedStage
  ) {
    return false;
  }

  if (
    signature.expectedMessageIncludes !== undefined &&
    !outcome.message?.includes(signature.expectedMessageIncludes)
  ) {
    return false;
  }

  return true;
}

function mixSeed(seed: number, iteration: number): number {
  return (
    (Math.trunc(seed) >>> 0) ^
    Math.imul((Math.trunc(iteration) >>> 0) + 1, 0x9e3779b9)
  );
}

function formatSeed(seed: number): string {
  return `0x${(Math.trunc(seed) >>> 0).toString(16)}`;
}
